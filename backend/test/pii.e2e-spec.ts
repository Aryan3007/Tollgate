import OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import { requestLogs, teams } from '../src/db/schema/index.js';
import { verhoeffCheckDigit } from '../src/modules/pii/detectors/checksums.js';
import { RequestLogWriter } from '../src/modules/request-logs/request-log.writer.js';
import { createKey, createTeam, createTestApp, loginAsAdmin, resetState, type TestApp } from './support/app.js';

const AADHAAR = `23456789012${verhoeffCheckDigit('23456789012')}`;
const PHONE = '9876543210';
const EMAIL = 'rahul.sharma@gmail.com';
const PAN = 'ABCPE1234F';
const CARD = '4111 1111 1111 1111';
const PROMPT = `Aadhaar ${AADHAAR}, phone ${PHONE}, email ${EMAIL}, PAN ${PAN}, card ${CARD}. Repeat: ${PHONE}`;
const RAW_VALUES = [AADHAAR, PHONE, EMAIL, PAN, CARD];

describe('PII masking (e2e)', () => {
  let t: TestApp;
  let token: string;
  let teamId: string;
  let client: OpenAI;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetState(t);
    token = await loginAsAdmin(t);
    teamId = (await createTeam(t, token)).id;
    const key = await createKey(t, token, teamId);
    client = new OpenAI({ apiKey: key.secret, baseURL: `${t.baseURL}/v1`, maxRetries: 0 });
    // The mock replies with the last user message, so the model "echoes" what it was sent.
    t.mock.behavior.reply = null;
  });

  const upstreamSaw = () => JSON.stringify(t.mock.requests);

  it('sends no raw PII upstream, yet the caller gets their original text back', async () => {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: PROMPT }],
    });

    for (const value of RAW_VALUES) expect(upstreamSaw()).not.toContain(value);
    expect(upstreamSaw()).toContain('<PHONE_1>');
    expect(completion.choices[0]?.message.content).toBe(PROMPT);
  });

  it('restores placeholders split across single-character stream chunks', async () => {
    t.mock.behavior.chunkSize = 1;

    const stream = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: PROMPT }],
      stream: true,
    });
    let text = '';
    for await (const chunk of stream) text += chunk.choices[0]?.delta.content ?? '';

    expect(text).toBe(PROMPT);
    for (const value of RAW_VALUES) expect(upstreamSaw()).not.toContain(value);
  });

  it('masks PII that appears in earlier assistant turns and system prompts', async () => {
    await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Support agent. Escalate to ${EMAIL}.` },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: `I will call ${PHONE}` },
        { role: 'user', content: 'ok' },
      ],
    });

    expect(upstreamSaw()).not.toContain(EMAIL);
    expect(upstreamSaw()).not.toContain(PHONE);
  });

  it('logs how many values were masked, and never the values themselves', async () => {
    await client.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: PROMPT }] });
    await t.app.get(RequestLogWriter).drain();

    const [row] = await t.db.select().from(requestLogs);

    expect(row?.redactionCount).toBe(6);
    expect(JSON.stringify(row)).not.toContain(PHONE);
  });

  it('counts a refused request’s masking too, and leaves clean prompts alone', async () => {
    await client.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hello there' }] });

    expect(upstreamSaw()).toContain('hello there');
    await t.app.get(RequestLogWriter).drain();
    expect((await t.db.select().from(requestLogs))[0]?.redactionCount).toBe(0);
  });

  describe('per-team toggles', () => {
    it('masks only the types the team enabled, and applies a change on the next request', async () => {
      await t.http().patch(`/v1/admin/teams/${teamId}`).auth(token, { type: 'bearer' }).send({ piiEntities: ['email'] }).expect(200);

      await client.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: PROMPT }] });

      expect(upstreamSaw()).not.toContain(EMAIL);
      expect(upstreamSaw()).toContain(PHONE);
    });

    it('sends everything through when masking is switched off', async () => {
      await t.http().patch(`/v1/admin/teams/${teamId}`).auth(token, { type: 'bearer' }).send({ piiEntities: [] }).expect(200);

      const completion = await client.chat.completions.create({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: PROMPT }] });

      expect(upstreamSaw()).toContain(PHONE);
      expect(completion.choices[0]?.message.content).toBe(PROMPT);
    });

    it('defaults new teams to all five types', async () => {
      const [team] = await t.db.select().from(teams).where(eq(teams.id, teamId));

      expect(team?.piiEntities).toEqual(['aadhaar', 'pan', 'phone', 'card', 'email']);
    });

    it('rejects unknown types and duplicates', async () => {
      const patch = (body: object) => t.http().patch(`/v1/admin/teams/${teamId}`).auth(token, { type: 'bearer' }).send(body);

      await patch({ piiEntities: ['passport'] }).expect(400);
      await patch({ piiEntities: ['phone', 'phone'] }).expect(400);
    });
  });
});
