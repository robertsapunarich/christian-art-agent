// test/index.spec.ts
import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Christian Art Agent worker', () => {
	it('responds with API info (unit style)', async () => {
		const request = new IncomingRequest('http://example.com');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		const responseData = await response.json();
		expect(responseData).toHaveProperty('message', 'Christian Art History AI Agent');
		expect(responseData).toHaveProperty('endpoints');
	});

	it('responds with API info (integration style)', async () => {
		const response = await SELF.fetch('https://example.com');
		const responseData = await response.json();
		expect(responseData).toHaveProperty('message', 'Christian Art History AI Agent');
		expect(responseData).toHaveProperty('endpoints');
	});
});