# painel-vivanet

Painel do atendente da Viva Net, aberto dentro do Chatwoot como **Dashboard App** (`painel.vivanettelecom.com.br`).

- **Login**: e-mail e senha do Chatwoot, conferidos no próprio Chatwoot (conta 1). Sessão assinada de 12 h; a senha não é guardada.
- **Contexto**: o Chatwoot informa o contato aberto; o painel lê o atributo `contrato` e busca a ficha no gateway.
- **Dados**: `sgp-gateway` `/v1/painel/contrato` e `/v1/painel/documento` (canal `painel`), mais `/v1/email/fatura`.
- **Abas**: Dados do cliente, Financeiro, Rede, Atendimento e Histórico (a aba inicial segue o caso: suspenso/vencida → Financeiro; offline → Rede).
- Para testar fora do Chatwoot: `/?contrato=740710` (com sessão).

Variáveis: ver `.env.example`. Produção: `pnpm install && pnpm build && PORT=3020 pm2 start pnpm --name vivanet-painel -- start`.
