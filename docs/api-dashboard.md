# Dashboard compartilhável — integração com painel de indicadores

Duas formas de exibir os indicadores de SAF fora do sistema:

| Forma | Endereço | Quando usar |
|---|---|---|
| **API JSON** | `GET /api/v1/dashboard` | O painel monta os próprios gráficos |
| **Página pronta** | `/publico/dashboard` | Embutir num iframe ou exibir numa TV |

Os números das duas vêm da mesma fonte da página interna `/dashboard`
(`src/lib/dashboardData.ts`), então não divergem.

## Autenticação

Token somente-leitura na variável de ambiente `SAF_DASHBOARD_TOKEN`.

É **separado** da `SAF_API_KEY`: destrava apenas indicadores agregados, nunca
dados de ticket nem o resto da API v1. Isso o torna seguro de usar num painel
de terceiros, inclusive dentro do navegador, onde nada é secreto de fato.

Três formas de enviar, todas equivalentes:

```
X-Dashboard-Token: <token>
Authorization: Bearer <token>
?token=<token>
```

A querystring existe para os casos em que só é possível colar uma URL
(iframe, TV, painéis que não deixam configurar headers).

Gerar um valor:

```bash
openssl rand -hex 32
```

## API JSON

```bash
curl -H "X-Dashboard-Token: $TOKEN" \
  'https://saf-monitor.vercel.app/api/v1/dashboard?mes=2026-08'
```

- `mes` (opcional): `YYYY-MM`. Padrão: mês corrente. Aceita `month` como alias.
- **CORS liberado** (`Access-Control-Allow-Origin: *`) — funciona direto de um
  app no navegador. `OPTIONS` responde ao preflight.
- `Cache-Control: public, max-age=180` — os dados são recalculados no máximo a
  cada 3 min (ver *Custo* abaixo).

### Formato da resposta

```jsonc
{
  "mes": "2026-08",
  "atualizadoEm": "2026-08-19T14:44:59.870Z",

  "indicadoresGlobais": {
    "safsAbertos": 435,
    "safsResolvidos": 375,
    "percentualResolvidos": 86,      // null se não houve aberturas
    "aguardandoNos": 20,
    "aguardandoFranquia": 40,
    "slaNoPrazoPercentual": 55,      // null se nada tinha prazo definido
    "safsTempoMedioSeg": 287801,     // horário útil (fim de semana não conta)
    "whatsappConversas": 33,
    "whatsappCsatMedio": 4.6,
    "whatsappCsatAvaliacoes": 63,
    "whatsappTempoMedioSeg": 147182, // relógio corrido (vem do Chatwoot)
    "whatsappResolvidas": 47
  },

  "setores": [
    {
      "slug": "pd-i",
      "nome": "PD&I",
      "safs": {
        "abertos": 55, "resolvidos": 46, "percentualResolvidos": 84,
        "aguardandoNos": 4, "aguardandoFranquia": 5,
        "slaNoPrazoPercentual": 76, "tempoMedioSeg": 290359
      },
      "whatsapp": {                  // null nos setores sem Chatwoot
        "conversas": 0, "resolvidas": 0,
        "csatMedio": 4.5, "csatAvaliacoes": 16,
        "tempoMedioSeg": null, "primeiraRespostaSeg": null
      }
    }
  ],

  // 12 meses, do mais ANTIGO para o mais recente (ordem natural de gráfico)
  "historico": [
    {
      "mes": "2025-09",
      "setores": [
        { "slug": "pd-i", "abertos": 40, "resolvidos": 33,
          "slaNoPrazoPercentual": 70, "tempoMedioSeg": 250000 }
      ]
    }
  ]
}
```

Convenções: tempos **sempre em segundos** (o painel formata como quiser);
percentuais como número inteiro (`86` = 86%); `null` significa "sem base para
calcular", que é diferente de zero.

### Erros

| Status | Situação |
|---|---|
| `401` | Token ausente ou inválido |
| `500` | `SAF_DASHBOARD_TOKEN` não configurada no servidor |

## Página pronta (iframe)

```html
<iframe
  src="https://saf-monitor.vercel.app/publico/dashboard?token=SEU_TOKEN"
  width="100%" height="900" style="border:0">
</iframe>
```

- Somente leitura: sem menu, sem login, sem links de navegação.
- Fundo escuro e números grandes, para leitura à distância.
- Recarrega sozinha a cada 120s (não precisa de ninguém apertando F5).
- `noindex, nofollow` — não é indexada por buscadores.
- Aceita `?mes=YYYY-MM` para fixar um mês.

## Definição dos indicadores

- **Resolvidos**: SAFs abertos **e** resolvidos dentro do mesmo mês. Um SAF
  aberto em julho e resolvido em agosto conta como aberto em julho e não entra
  em nenhuma contagem de resolvidos de agosto.
- **% resolvidos**: resolvidos ÷ abertos no mês.
- **SLA no prazo**: entre os resolvidos que **tinham prazo definido**, quantos
  saíram dentro dele.
- **Tempo médio de SAF**: abertura → resolução em **horário útil**.
- **WhatsApp**: conversas, CSAT e tempos vêm do relatório do Chatwoot, em
  **relógio corrido** (sem desconto de fim de semana). Não são comparáveis
  diretamente com o tempo médio de SAF.

## Custo e cache

Montar o dashboard leva ~10s: uma consulta pesada ao banco mais 18 chamadas ao
Chatwoot (o endpoint de CSAT chega a levar 7s por setor). Por isso o resultado é
memoizado por **3 minutos**, compartilhado entre a página interna, a API e a
página pública.

Consequência prática: **não vale configurar o painel para atualizar em menos de
3 minutos** — dentro da janela ele recebe o mesmo valor cacheado. O Chatwoot é
auto-hospedado e satura sob volume alto de requisições.
