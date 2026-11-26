import { request } from 'node:http';

const BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104,
  109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515,
  526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049,
  3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080,
]);

export function loopbackFetch(input, init = {}) {
  const url = new URL(input);
  if (!BAD_PORTS.has(Number(url.port))) return fetch(input, init);
  return new Promise((resolve, reject) => {
    const { signal } = init;
    const fail = error => reject(signal?.aborted ? signal.reason : new TypeError('fetch failed', { cause: error }));
    const req = request(url, { method: init.method || 'GET', headers: init.headers, signal }, res => {
      const status = res.statusCode;
      if (status >= 300 && status < 400 && init.redirect === 'error') {
        res.destroy();
        return fail(new Error('unexpected redirect'));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', fail);
      res.on('end', () => resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status })));
    });
    req.on('error', fail);
    req.end(init.body);
  });
}
