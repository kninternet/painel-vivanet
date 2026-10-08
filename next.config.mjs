/** O painel abre dentro do Chatwoot (Dashboard App): só esse endereço pode emoldurá-lo. */
const CHATWOOT = process.env.CHATWOOT_URL ?? 'https://chat.vivanettelecom.com.br';
export default {
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: `frame-ancestors ${CHATWOOT}` },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
      ],
    }];
  },
};
