import request from 'supertest';
import { createApp } from '../app';
export async function approvePending(app: Awaited<ReturnType<typeof createApp>>) {
  const http = request(app.app.getHttpServer());
  const token = (await http.post('/api/auth/login').send({ login: 'lead', password: 'demo1234' }))
    .body.token;
  const rows = (await http.get('/api/approvals').auth(token, { type: 'bearer' }).expect(200)).body;
  for (const row of rows.filter((r: { status: string }) => r.status === 'PENDING'))
    await http
      .post(`/api/requests/${row.id}/review`)
      .auth(token, { type: 'bearer' })
      .send({ decision: 'APPROVED' })
      .expect(201);
}
