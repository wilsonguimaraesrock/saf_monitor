# Atendimento ativo — integração SAF Monitor ↔ ChatBot Whats Franquias

Conversa iniciada pela franqueadora para a escola, em vez de esperar a escola
escrever. Este documento registra o que já está implementado deste lado, como
testar, e o que ainda depende do chatbot.

## Por que passa pelo chatbot

A inbox 11 do Chatwoot é `Channel::Api`: o Chatwoot guarda a conversa mas não
fala com o WhatsApp. Quem entrega é o ChatBot Whats Franquias.

Testamos criar contato + conversa + mensagem direto pela API do Chatwoot: a
mensagem **não chega** no celular e o Chatwoot marca `sent` sem erro nenhum. A
entrega depende de estado interno do app, e a primeira mensagem precisa ser um
template aprovado pela Meta (política do WhatsApp para conversa iniciada pela
empresa). Por isso o caminho é `POST /api/admin/active-handoffs`.

## Configuração

```
CHATBOT_API_URL=https://<host-do-chatbot>
CHATBOT_API_USER=<usuário da Basic Auth>
CHATBOT_API_PASSWORD=<senha da Basic Auth>
```

Credencial de serviço, só no servidor. O navegador nunca a vê: o painel fala
com `/api/chatbot/*`, que faz o proxy. Sem essas variáveis o botão responde
`503` com mensagem explicando, em vez de quebrar.

A API tem prefixo global `/api` — os caminhos são `/api/admin/...`.

## O que está implementado

| Arquivo | Papel |
|---|---|
| `src/integrations/chatbot.ts` | Cliente Basic Auth, cadastro em cascata e `active-handoffs`, com os erros traduzidos |
| `src/app/api/chatbot/catalogo/route.ts` | Proxy do cadastro (cache de 5 min) |
| `src/app/api/chatbot/active-handoff/route.ts` | Dispara o handoff, grava auditoria, devolve a conversa |
| `src/components/IniciarConversaModal.tsx` | Cascata unidade → número → departamento → subdepartamento → assunto |
| `src/components/SectorChatwootLiveSection.tsx` | Botão "Iniciar conversa" no cabeçalho do setor |
| `src/components/ChatwootConversationModal.tsx` | Trava da caixa de resposta na janela de 24h |
| `supabase/migrations/006_conversas_ativas.sql` | Auditoria de quem iniciou o quê |

Decisões que importam para quem for mexer:

- **O atendente vem da sessão (JWT), nunca do corpo da requisição.** Deixar o
  cliente informar quem abriu permitiria assinar atendimento com o nome de
  outra pessoa.
- **Registro inativo é filtrado no cliente.** O cadastro do chatbot tem 1
  departamento, 3 subdepartamentos e 36 assuntos inativos, e os endpoints de
  leitura devolvem inativos mesmo com filtro por pai. O `POST` recusa esses
  itens com a mensagem "não pertence ao departamento informado", que não diz
  nada sobre estar inativo — oferecer um inativo no seletor viraria um 400
  incompreensível.
- **Não há campo de mensagem.** A primeira mensagem é o template da Meta,
  montado pelo chatbot com setor, assunto e nome do atendente.
- **O POST não é repetido automaticamente** (`idempotent: false`): se a conexão
  cair depois de enviada, a escola pode já ter recebido o template. Repetir
  mandaria uma segunda mensagem.
- **Janela de 24h**: enquanto a escola não responder ao template, o WhatsApp não
  entrega texto livre — e não entrega nem pelo Chatwoot, porque a restrição é da
  plataforma. O Chatwoot aceita e a mensagem morre em silêncio. A caixa de
  resposta fica travada até chegar a primeira mensagem da escola; nota interna
  continua liberada, porque não vai para o WhatsApp. A regra não olha a origem
  da conversa: conversa receptiva sempre tem mensagem recebida, então "nenhuma
  mensagem recebida" identifica exatamente o handoff à espera de resposta.

## Tratamento dos erros

| Status | O que o painel faz |
|---|---|
| `201` | Abre a conversa criada direto no modal, sem esperar o poll de 30s |
| `400` / `404` | "Refaça a seleção" — não convida a repetir igual |
| `409` | Mostra "já existe atendimento" **e** o botão que leva à conversa em andamento, usando o `chatwootConversationId` da resposta |
| `502` / rede | Diz que a escola não foi notificada e pede para avisar o suporte antes de repetir, porque cada tentativa envia mensagem ao franqueado |

## Pendências do lado do chatbot

Estado dos testes feitos em 01/09/2026, todos contra um número de teste interno:

1. **O template não é enviado.** A nota interna do rollback diz "falha ao enviar
   a mensagem de template ao WhatsApp", em 100% das tentativas, com a aplicação
   saudável (`/api/health` 0,1s e `/api/admin/units` 0,5s no mesmo instante).
   Suspeita do próprio dev: variável de ambiente do template não configurada em
   produção.
2. **O handoff dispara o fluxo receptivo.** O número de teste recebeu a saudação
   do menu ("qual é o seu nome?") — pergunta cujo dado o handoff já conhece — e
   depois o encerramento com pedido de avaliação. Essas mensagens saem por fora
   do Chatwoot: as conversas ficam com zero mensagem pública.
3. **CSAT de atendimento que não aconteceu.** O encerramento automático dispara a
   pesquisa de satisfação, o que distorce o indicador do setor.
4. **`502` vem do proxy, não da aplicação** — corpo HTML (`text/html`, 2871
   bytes, `Connection: close`), 4-8s, enquanto os outros endpoints respondem em
   menos de 0,5s. Não é estouro de timeout.
5. **Rollback em `pending` polui o painel.** Conversa em `pending` conta no
   cartão "Pendentes" do setor e no backlog do mês: cada handoff que falha
   viraria tarefa fantasma sobre uma escola que nunca foi avisada.

Sugestão para 3 e 5: **criar a conversa no Chatwoot só depois de o template ser
aceito pelo WhatsApp**. Sem estado criado antes, não há rollback, não dispara
CSAT, não polui painel, e o `502` passa a significar exatamente "nada
aconteceu, pode repetir" — que é o que a documentação já promete.

## Como testar

1. `npm run db:migrate` (aplica a `006`).
2. Configure as três variáveis e suba o app.
3. Painel de um setor → **Iniciar conversa** → escolha escola, número,
   departamento, subdepartamento e assunto.
4. Sucesso: a escola recebe o template e a conversa abre no modal, com a caixa
   de resposta travada até ela responder.

Para testar sem interface, o mesmo payload que o painel monta:

```bash
curl -X POST "$CHATBOT_API_URL/api/admin/active-handoffs" \
  -u "$CHATBOT_API_USER:$CHATBOT_API_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"unitId":"…","whatsappNumberId":"…","departmentId":"…",
       "subdepartmentId":"…","subjectId":"…",
       "agent":{"id":"1","name":"Nome do atendente"}}'
```

Cuidado ao repetir: cada tentativa que passa da validação envia mensagem para o
WhatsApp da escola.
