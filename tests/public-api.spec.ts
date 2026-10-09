import { test, expect, APIRequestContext, APIResponse } from '@playwright/test';

type ApiObject = {
  id: string;
  name: string;
  data: unknown;
  createdAt?: string | number;
  updatedAt?: string | number;
};

type ErrorBody = { error?: string };

async function skipIfDailyLimit(response: APIResponse): Promise<void> {
  if (response.status() !== 405) return;
  const body = await response.text();
  if (body.includes('daily request limit')) {
    test.skip(true, `Public API daily request quota is exhausted: ${body}`);
  }
}

class PublicApiPage {
  private readonly baseUrl = 'https://api.restful-api.dev';
  private readonly jsonHeaders = { 'Content-Type': 'application/json' };

  constructor(private readonly request: APIRequestContext) {}

  private async checked(responsePromise: Promise<APIResponse>): Promise<APIResponse> {
    const response = await responsePromise;
    await skipIfDailyLimit(response);
    return response;
  }

  async list(ids?: string[]): Promise<APIResponse> {
    const query = new URLSearchParams();
    ids?.forEach((id) => query.append('id', id));
    const queryString = query.toString();
    return this.checked(this.request.get(`${this.baseUrl}/objects${queryString ? `?${queryString}` : ''}`));
  }

  get(id: string): Promise<APIResponse> {
    return this.checked(this.request.get(`${this.baseUrl}/objects/${encodeURIComponent(id)}`));
  }

  create(body: unknown): Promise<APIResponse> {
    return this.checked(this.request.post(`${this.baseUrl}/objects`, { headers: this.jsonHeaders, data: body }));
  }

  put(id: string, body: unknown): Promise<APIResponse> {
    return this.checked(this.request.put(`${this.baseUrl}/objects/${encodeURIComponent(id)}`, { headers: this.jsonHeaders, data: body }));
  }

  patch(id: string, body: unknown): Promise<APIResponse> {
    return this.checked(this.request.patch(`${this.baseUrl}/objects/${encodeURIComponent(id)}`, { headers: this.jsonHeaders, data: body }));
  }

  delete(id: string): Promise<APIResponse> {
    return this.checked(this.request.delete(`${this.baseUrl}/objects/${encodeURIComponent(id)}`));
  }

  async readJson<T>(response: APIResponse): Promise<T> {
    return response.json() as Promise<T>;
  }

  async cleanup(ids: Set<string>): Promise<void> {
    for (const id of ids) {
      const current = await this.get(id);
      if (current.status() === 404) continue;
      if (!current.ok()) throw new Error(`Could not check cleanup state for object ${id}: HTTP ${current.status()}`);
      const removed = await this.delete(id);
      if (!removed.ok()) throw new Error(`Could not clean up object ${id}: HTTP ${removed.status()}`);
    }
  }
}

function expectJson(response: APIResponse): void {
  expect(response.headers()['content-type']).toContain('application/json');
}

function expectTimestamp(value: string | number | undefined): void {
  expect(value).toBeDefined();
  const parsed = typeof value === 'number' ? value : Date.parse(value ?? '');
  expect(Number.isFinite(parsed)).toBeTruthy();
}

test.describe('Public REST API', () => {
  test('Comprehensive public API contract and CRUD coverage', async ({ request }) => {
    const api = new PublicApiPage(request);
    const createdIds = new Set<string>();
    const createFixture = async (name: string, data: unknown): Promise<ApiObject> => {
      const response = await api.create({ name, data });
      expect(response.ok(), `POST should create ${name}`).toBeTruthy();
      expectJson(response);
      const body = await api.readJson<ApiObject>(response);
      expect(body.id).toBeTruthy();
      expect(body.name).toBe(name);
      expect(body.data).toEqual(data);
      createdIds.add(body.id);
      return body;
    };

    try {
      // Check the public list endpoint response and reachability before encoding its contract in automation.
      const listResponse = await api.list();
      expect(
        listResponse.ok(),
        `GET /objects returned HTTP ${listResponse.status()}: ${await listResponse.text()}`,
      ).toBeTruthy();
      expectJson(listResponse);
      const objects = await api.readJson<ApiObject[]>(listResponse);
      expect(Array.isArray(objects)).toBeTruthy();
      expect(objects.some((item) => item.id === '1' && item.name === 'Google Pixel 6 Pro')).toBeTruthy();
      expect(objects.some((item) => item.id === '7' && item.name === 'Apple MacBook Pro 16')).toBeTruthy();
      expect(objects.every((item) => typeof item.id === 'string' && typeof item.name === 'string' && 'data' in item)).toBeTruthy();

      // Verify repeated id query parameters return only the requested public objects.
      const filteredResponse = await api.list(['3', '5', '10']);
      expect(filteredResponse.ok()).toBeTruthy();
      const filtered = await api.readJson<ApiObject[]>(filteredResponse);
      expect(new Set(filtered.map((item) => item.id))).toEqual(new Set(['3', '5', '10']));
      expect(filtered.every((item) => ['3', '5', '10'].includes(item.id))).toBeTruthy();
      const mixedResponse = await api.list(['1', 'pw-nonexistent-id-987654321']);
      expect(mixedResponse.ok()).toBeTruthy();
      const mixed = await api.readJson<ApiObject[]>(mixedResponse);
      expect(mixed.map((item) => item.id)).toEqual(['1']);
      const duplicateResponse = await api.list(['3', '3']);
      expect(duplicateResponse.ok()).toBeTruthy();
      const duplicateResult = await api.readJson<ApiObject[]>(duplicateResponse);
      expect(duplicateResult.length).toBeGreaterThan(0);
      expect(duplicateResult.every((item) => item.id === '3')).toBeTruthy();

      // Verify the documented GET-by-ID response contract for object 7.
      const sampleResponse = await api.get('7');
      expect(
        sampleResponse.ok(),
        `GET /objects/7 returned HTTP ${sampleResponse.status()}: ${await sampleResponse.text()}`,
      ).toBeTruthy();
      expectJson(sampleResponse);
      const sample = await api.readJson<ApiObject>(sampleResponse);
      expect(sample).toMatchObject({
        id: '7',
        name: 'Apple MacBook Pro 16',
        data: { year: 2019, price: 1849.99, 'CPU model': 'Intel Core i9', 'Hard disk size': '1 TB' },
      });
      const nullDataResponse = await api.get('2');
      expect(nullDataResponse.ok()).toBeTruthy();
      const nullData = await api.readJson<ApiObject>(nullDataResponse);
      expect(nullData.id).toBe('2');
      expect(nullData).toHaveProperty('data', null);
      const missingObject = await api.get('pw-never-exists-987654321');
      expect(missingObject.status()).toBe(404);
      expect((await api.readJson<ErrorBody>(missingObject)).error).toContain('not found');

      // Create a temporary public API object to validate the POST and response shape before including create-fixture tests.
      const flexibleData = {
        text: 'quoted " and unicode ñ',
        zero: 0,
        disabled: false,
        empty: '',
        nullable: null,
        tags: ['api', 'playwright'],
        nested: { enabled: true },
      };
      const created = await createFixture(`public-api-${Date.now()}`, flexibleData);
      expectTimestamp(created.createdAt);
      const createdRead = await api.get(created.id);
      expect(createdRead.ok()).toBeTruthy();
      expect(await api.readJson<ApiObject>(createdRead)).toMatchObject({ id: created.id, name: created.name, data: flexibleData });

      // Exercise other documented flexible JSON data shapes and retain IDs for cleanup.
      const arrayData = await createFixture(`public-api-array-${Date.now()}`, [{ value: 1 }, 'two', false]);
      expect(arrayData.data).toEqual([{ value: 1 }, 'two', false]);
      const nullDataCreated = await createFixture(`public-api-null-${Date.now()}`, null);
      expect(nullDataCreated.data).toBeNull();
      const scalarName = `public-api-scalar-${Date.now()}`;
      const scalarResponse = await api.create({ name: scalarName, data: 'scalar-value' });
      if (scalarResponse.ok()) {
        expectJson(scalarResponse);
        const scalarDataCreated = await api.readJson<ApiObject>(scalarResponse);
        createdIds.add(scalarDataCreated.id);
        expect(scalarDataCreated).toMatchObject({ name: scalarName, data: 'scalar-value' });
      } else {
        expect(scalarResponse.status()).toBeGreaterThanOrEqual(400);
        expect(scalarResponse.status()).toBeLessThan(500);
        expect((await api.readJson<ErrorBody>(scalarResponse)).error).toBeTruthy();
      }

      // Verify the full CRUD lifecycle against a disposable created object, including PUT replacement, PATCH preservation, DELETE result, and post-delete lookup.
      const original = await createFixture(`public-api-crud-${Date.now()}`, { retainedBeforePut: true, replaceMe: 'old' });
      const replacement = { name: `${original.name}-replaced`, data: { replacement: 'complete', count: 2 } };
      const putResponse = await api.put(original.id, replacement);
      expect(putResponse.ok()).toBeTruthy();
      expectJson(putResponse);
      const putBody = await api.readJson<ApiObject>(putResponse);
      expect(putBody).toMatchObject({ id: original.id, ...replacement });
      expectTimestamp(putBody.updatedAt);
      const afterPutResponse = await api.get(original.id);
      expect(afterPutResponse.ok()).toBeTruthy();
      const afterPut = await api.readJson<ApiObject>(afterPutResponse);
      expect(afterPut.data).toEqual(replacement.data);
      expect(afterPut.data).not.toHaveProperty('retainedBeforePut');

      const patchedName = `${replacement.name}-patched`;
      const patchResponse = await api.patch(original.id, { name: patchedName });
      expect(patchResponse.ok()).toBeTruthy();
      expectJson(patchResponse);
      const patchBody = await api.readJson<ApiObject>(patchResponse);
      expect(patchBody).toMatchObject({ id: original.id, name: patchedName, data: replacement.data });
      expectTimestamp(patchBody.updatedAt);
      const afterPatchResponse = await api.get(original.id);
      expect(afterPatchResponse.ok()).toBeTruthy();
      expect(await api.readJson<ApiObject>(afterPatchResponse)).toMatchObject({ id: original.id, name: patchedName, data: replacement.data });

      // Check live API behavior for unknown resources, malformed JSON, and advertised CORS preflight handling.
      const malformedPost = await request.post('https://api.restful-api.dev/objects', {
        headers: { 'Content-Type': 'application/json' },
        data: '{bad json',
      });
      await skipIfDailyLimit(malformedPost);
      expect(malformedPost.status()).toBe(400);
      expectJson(malformedPost);
      expect((await api.readJson<ErrorBody>(malformedPost)).error).toBeTruthy();
      const missingName = await api.create({ data: { invalid: true } });
      expect(missingName.ok()).toBeFalsy();
      const missingData = await api.create({ name: 'missing-data' });
      expect(missingData.ok()).toBeFalsy();

      const beforeInvalidPutResponse = await api.get(original.id);
      const beforeInvalidPut = await api.readJson<ApiObject>(beforeInvalidPutResponse);
      const invalidPut = await api.put(original.id, '{invalid json');
      expect(invalidPut.ok()).toBeFalsy();
      const afterInvalidPutResponse = await api.get(original.id);
      expect(await api.readJson<ApiObject>(afterInvalidPutResponse)).toEqual(beforeInvalidPut);
      const invalidPatch = await api.patch(original.id, '{invalid json');
      expect(invalidPatch.ok()).toBeFalsy();
      const afterInvalidPatchResponse = await api.get(original.id);
      expect(await api.readJson<ApiObject>(afterInvalidPatchResponse)).toEqual(beforeInvalidPut);

      const preflight = await request.fetch('https://api.restful-api.dev/objects', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type',
        },
      });
      await skipIfDailyLimit(preflight);
      expect(preflight.ok()).toBeTruthy();
      expect(preflight.headers()['access-control-allow-origin']).toBe('*');

      const deleteResponse = await api.delete(original.id);
      expect(deleteResponse.ok()).toBeTruthy();
      expectJson(deleteResponse);
      const deleteBody = await api.readJson<{ message: string }>(deleteResponse);
      expect(deleteBody.message).toContain(`id = ${original.id}`);
      createdIds.delete(original.id);
      const afterDelete = await api.get(original.id);
      expect(afterDelete.status()).toBe(404);
      expect((await api.readJson<ErrorBody>(afterDelete)).error).toContain('not found');
      const repeatedDelete = await api.delete(original.id);
      expect([404, 200]).toContain(repeatedDelete.status());

      // Verify HTTPS, unauthenticated access, and JSON responses across the public routes.
      const publicList = await api.list();
      const publicGet = await api.get('7');
      const publicPostProbe = await api.create({ name: `public-api-auth-check-${Date.now()}`, data: { public: true } });
      expect(publicList.ok()).toBeTruthy();
      expect(publicGet.ok()).toBeTruthy();
      expect(publicPostProbe.ok()).toBeTruthy();
      expectJson(publicList);
      expectJson(publicGet);
      expectJson(publicPostProbe);
      const probe = await api.readJson<ApiObject>(publicPostProbe);
      createdIds.add(probe.id);
      const publicPut = await api.put(probe.id, { name: `${probe.name}-put`, data: { public: true, changed: true } });
      expect(publicPut.ok()).toBeTruthy();
      expectJson(publicPut);
      const publicPatch = await api.patch(probe.id, { name: `${probe.name}-patch` });
      expect(publicPatch.ok()).toBeTruthy();
      expectJson(publicPatch);
      const publicDelete = await api.delete(probe.id);
      expect(publicDelete.ok()).toBeTruthy();
      expectJson(publicDelete);
      createdIds.delete(probe.id);

      const unsupportedMethod = await request.fetch('https://api.restful-api.dev/objects', { method: 'INVALID' });
      await skipIfDailyLimit(unsupportedMethod);
      expect(unsupportedMethod.ok()).toBeFalsy();
    } finally {
      await api.cleanup(createdIds);
    }
  });
});
