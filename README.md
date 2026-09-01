# 🚀 Máximo Store — Bot de Vendas Discord

Bot completo de vendas para Discord com EFI Bank PIX + Boleto, sistema de tickets, caixas misteriosas, afiliados, fidelidade, sistema de coins, convites e muito mais.

---

## ✅ Status de Configuração

| Item | Status |
|---|---|
| `DISCORD_TOKEN` | ✅ Configurado |
| `CLIENT_ID` | ✅ `1533637582393446561` |
| `GUILD_ID` | ✅ `1522456699082903572` |
| `EFI_CLIENT_ID` | ✅ Configurado |
| `EFI_CLIENT_SECRET` | ✅ Configurado |
| `EFI_PIX_KEY` | ✅ Chave aleatória configurada |
| `EFI_CERTIFICATE_PATH` | ✅ `./producao-940835-Loja 2.0.p12` |
| `EFI_SANDBOX` | ✅ `false` (produção) |
| `WEBHOOK_URL` | ⏳ Preencher após deploy Railway |
| `DISCORD_WEBHOOK_LOGS` | ✅ Configurado |

---

## 🚀 Como Iniciar

```bash
npm install
npm run deploy    # registra os 22 comandos slash
npm start         # inicia o bot
```

---

## 🗺️ Canais Fixos

| Canal | ID | Função |
|---|---|---|
| Painel Admin | `1533638769901703178` | Embed com todos os controles |
| Loja / Carrinhos | `1544177169440317440` | Painel de produtos com select menu |
| Resgatar Codes | `1544209839108915330` | Embed para resgatar códigos de coins |
| Logs | `1530046463927648368` | **Apenas transcripts de tickets** |

---

## 🎛️ Painel Admin — `/painel` no canal `1533638769901703178`

O painel é enviado automaticamente ao iniciar o bot e tem 5 submenus:

### 🏠 Home
Mostra estatísticas em tempo real: vendas hoje, receita, pendentes, tickets, usuários.

**Botões:** `🟢/🔴 Abrir/Fechar Loja` • `🔧 Manutenção` • `🔄 Atualizar` • `📊 Relatório`

**Submenus:** `🛒 Carrinhos` • `📦 Produtos` • `⚙️ Gestão` • `👥 Usuários` • `🎁 Caixa Misteriosa`

---

### 🛒 Menu Carrinhos
Tudo para gerenciar painéis de produtos nos canais.

| Botão | Ação |
|---|---|
| ➕ Criar Carrinho | Modal: nome, canal de destino, imagem, cor |
| 📋 Ver Carrinhos | Lista todos os carrinhos ativos com planos |
| + Add Plano | Modal: nome do plano, preço |
| 📥 Add Estoque | Modal: ID da variante + itens (1 linha = 1 produto) |
| ➖ Remover Plano | Remove plano pelo ID |
| 🗑️ Deletar Carrinho | Deleta embed do canal e remove do banco |
| 🎟️ Criar Cupom | Cria cupom de desconto (% ou fixo) |
| 🎟️ Ver Cupons | Lista cupons ativos |

**Como criar um carrinho:**
1. Clique em **➕ Criar Carrinho** → preenche nome, ID do canal, imagem e cor
2. Clique em **+ Add Plano** → adiciona planos com nome e preço
3. Clique em **📥 Add Estoque** → cola os itens (1 linha = 1 produto digital)
4. O painel aparece no canal com select menu `Selecione um produto`

> ⚠️ A imagem precisa ser uma URL direta (`.jpg`, `.png`). Para usar imagens do Discord: envie a imagem num canal → clique com botão direito → "Abrir link em nova aba" → copie a URL do CDN.

---

### 📦 Menu Produtos
| Botão | Ação |
|---|---|
| 📉 Estoque Baixo | Mostra variantes com ≤ 3 itens no estoque |
| 🏆 Top Produtos | Ranking dos mais vendidos |

---

### ⚙️ Menu Gestão
| Botão | Ação |
|---|---|
| ↩️ Reembolsos (N) | Lista pendentes com botões aprovar/rejeitar |
| 🎫 Tickets (N) | Lista tickets abertos com atendentes |
| ⏳ Pendentes (N) | Lista pedidos aguardando pagamento |
| 🔒 Fechar Todos Tickets | Fecha todos no banco e deleta canais |
| ❌ Cancelar Pendentes | Cancela todos os pedidos pendentes |
| 🪙 Remover Coins | Remove coins de um usuário (modal) |
| ⚡ Flash Sale | Inicia oferta relâmpago com % de desconto e timer |
| 📊 Relatório | Vendas por período (hoje/7d/30d/total) |

---

### 👥 Menu Usuários
| Botão | Ação |
|---|---|
| 🔍 Buscar Usuário | Busca por Discord ID |
| 🪙 Add Coins | Adiciona coins a um usuário (Owner only) |
| 🪙 Remover Coins | Remove coins de um usuário (Owner only) |
| 🎫 Gerar Códigos | Gera N códigos com X coins cada (Owner only) |
| 📣 Anúncio DM | Envia mensagem privada para todos do servidor |
| 🏆 Ranking | Top convidadores/compradores |

---

### 🎁 Menu Caixa Misteriosa
| Botão | Ação |
|---|---|
| ⚙️ Criar/Editar Caixa | Define nome, preço, canal e imagem |
| ➕ Adicionar Item | Seleciona variante + raridade + % de chance |
| ➖ Remover Item | Remove item da caixa |
| 📢 Publicar no Canal | Envia/atualiza o embed da caixa no canal |
| 🟢/🔴 Ativar/Desativar | Liga ou desliga a caixa |
| 📊 Ver Histórico | Últimas 15 caixas abertas |

**Como configurar a caixa:**
1. **Criar/Editar** → define nome, preço, canal e imagem
2. **Adicionar Item** → lista todas as variantes de produtos existentes → escolhe ID, raridade e % chance
3. Todos os % devem somar 100% exatamente
4. **Publicar** → embed aparece no canal com botão de abrir

**4 raridades:** ⚪ Comum • 🔵 Raro • 🟣 Épico • 🌟 Lendário

---

## 🛒 Fluxo de Compra

### Via Painel de Produto (Carrinho)
1. Usuário vê o embed com imagem e select menu
2. Seleciona um plano → bot abre um **ticket de compra**
3. No ticket aparecem os botões de pagamento
4. Usuário clica em **💠 Pagar via PIX** → QR Code gerado
5. Paga → bot entrega o produto **no privado (DM)** automaticamente
6. Usuário confirma recebimento → **ticket fecha automaticamente**

### Via Caixa Misteriosa
1. Usuário clica em **🎁 Abrir Caixa** → PIX gerado
2. Paga → animação de abertura com barra de progresso
3. Resultado revelado com raridade e produto
4. Produto entregue na DM
5. Resultado anunciado no canal (sem spoiler, só raridade)

---

## 🎫 Sistema de Tickets

Tickets são abertos automaticamente em toda compra e podem ser abertos manualmente com `/ticket`.

| Permissão | Cargo |
|---|---|
| Ver todos os tickets | Suporte e superior |
| Assumir ticket | Apenas Admin e superior |
| Liberar sem pagamento | Cargo Aceitar Compra e superior |
| Configurar carrinhos | Cargo Loja e superior |

**Botões do ticket de compra:**
- `✋ Assumir` • `🔒 Fechar` • `📄 Transcrição` • `🚫 Fraude`
- `💠 Pagar via PIX` • `📄 Boleto` • `❌ Cancelar`
- `✅ Liberar Sem Pagamento` • `🪙 Pagar com Coins` • `🌐 Idioma`

**Transcrições:** ao fechar um ticket, o bot gera automaticamente um arquivo HTML com visual idêntico ao Discord e envia:
- Por DM ao cliente
- No canal de logs (`1530046463927648368`)

> ⚠️ O canal de logs só recebe transcripts. Nenhum outro log vai para lá.

---

## 🪙 Sistema de Coins

`1 coin = R$ 0,01` | `100 coins = R$ 1,00`

### Como obter coins
- **Comprar via PIX** → `/coins comprar [quantidade]`
- **Resgatar código** → Canal de códigos `1544209839108915330` → botão 🎫
- **Receber de convite** → 5 coins por cada pessoa que entrar pelo seu link
- **Owner adiciona** → Painel Admin → Usuários → 🪙 Add Coins

### Como usar
- **Pagar produtos** → botão 🪙 no ticket de compra
- **Ver saldo** → `!coins` ou `!saldo` em qualquer canal

### Comandos
| Comando | Descrição |
|---|---|
| `/coins saldo` | Ver saldo de coins |
| `/coins comprar [qtd]` | Comprar coins via PIX |
| `/coins transferir [@user] [qtd]` | Transferir para outro usuário |
| `/coins add [@user] [qtd]` | **[Owner]** Adicionar coins |
| `/coins remover [@user] [qtd]` | **[Owner]** Remover coins |
| `!coins` | Ver saldo (funciona em qualquer canal) |

---

## 🔗 Sistema de Convites

Cada pessoa que entrar no servidor pelo seu link de convite vale **5 coins** para você.

- Funcionamento: automático — o bot detecta qual invite foi usada
- Notificação por DM ao convidador
- Ver estatísticas: `/convites`

---

## 🌐 Sistema de Idiomas

O bot suporta 5 idiomas. Cada usuário escolhe o seu e o bot responde sempre nesse idioma.

| Idioma | Código |
|---|---|
| 🇧🇷 Português (Brasil) | `pt-BR` |
| 🇺🇸 English | `en` |
| 🇫🇷 Français | `fr` |
| 🇮🇳 हिन्दी (Hindi) | `hi` |
| 🇪🇸 Español | `es` |

Para trocar: clique no botão **🌐 Idioma** em qualquer mensagem do bot → select menu.

---

## 🏆 Sistema de Fidelidade

Pontos acumulados por compras desbloqueiam cargos automáticos:

| Cargo | Gasto mínimo | Desconto |
|---|---|---|
| 🛒 Cliente | R$ 0,01 | 0% |
| 💎 Cliente Premium | R$ 200,00 | 10% |
| 👑 Cliente Supremo | R$ 1.000,00 | 25% |

Os descontos são aplicados automaticamente em toda compra.

---

## 📋 Todos os Comandos

### 👤 Usuário
| Comando | Descrição |
|---|---|
| `/loja` | Abre a vitrine de produtos |
| `/comprar [id] [cupom]` | Compra produto pelo ID |
| `/carrinho` | Ver e gerenciar carrinho |
| `/pedidos [status]` | Histórico de pedidos |
| `/perfil [@user]` | Perfil com nível, pontos e saldo |
| `/saldo ver` | Saldo R$ + coins + últimas transações |
| `/saldo transferir` | Transferir saldo para outro usuário |
| `/coins saldo` | Ver saldo de coins |
| `/coins comprar [qtd]` | Comprar coins via PIX |
| `/coins transferir` | Transferir coins |
| `/historico [tipo]` | Histórico completo (4 tipos) |
| `/nota [pedido_id]` | Nota fiscal do pedido |
| `/ticket [tipo]` | Abrir ticket de suporte |
| `/afiliado painel` | Dashboard de afiliado |
| `/afiliado usar [codigo]` | Vincular código de afiliado |
| `/caixa abrir` | Ver caixas misteriosas |
| `/caixa historico` | Histórico de caixas abertas |
| `/ranking [tipo]` | Top compradores / pontos / afiliados |
| `/convites` | Estatísticas de convites e coins ganhos |
| `!coins` | Ver saldo de coins (sem slash) |
| `!saldo` | Ver saldo R$ e coins (sem slash) |

### ⚙️ Admin / Staff
| Comando | Permissão | Descrição |
|---|---|---|
| `/painel` | Staff+ | Painel admin visual |
| `/painel criar` | Loja+ | Criar carrinho de produto |
| `/painel variante` | Loja+ | Adicionar plano ao carrinho |
| `/painel estoque` | Loja+ | Adicionar estoque digital |
| `/painel listar` | Loja+ | Listar variantes de produto |
| `/painel atualizar` | Loja+ | Atualizar embed do painel |
| `/setup loja` | Admin | Embed da vitrine no canal |
| `/setup caixas` | Admin | Embed de caixas misteriosas |
| `/setup regras` | Admin | Embed de regras |
| `/produto adicionar` | Loja+ | Adicionar produto |
| `/produto editar` | Loja+ | Editar campo de produto |
| `/produto estoque_add` | Loja+ | Adicionar estoque digital |
| `/admin stats` | Staff+ | Estatísticas da loja |
| `/admin usuario` | Staff+ | Info de usuário |
| `/admin bloquear` | Admin | Bloquear usuário |
| `/admin add_saldo` | Admin | Ajustar saldo |
| `/admin loja` | Admin | Abrir/fechar loja |
| `/admin config` | Admin | Alterar configurações |
| `/cupom criar` | Loja+ | Criar cupom |
| `/flashsale iniciar` | Admin | Flash Sale |
| `/admin-caixa criar` | Loja+ | Criar caixa misteriosa (legado) |

---

## 🗂️ Hierarquia de Cargos

```
👑 Owner          (1522459532469469225)  → Tudo + gerenciar coins
⚙️ Admin          (1522458772801458236)  → Gestão completa
🛒 Loja           (1522806323446681741)  → Produtos e carrinhos
✅ Aceitar Compra (1522791855597555842)  → Liberar sem pagamento
🛡️ Moderador      (1522459007854575697)  → Ver tickets e pedidos
🆘 Suporte        (1522457765161992292)  → Atender tickets
```

---

## 🏗️ Arquitetura

```
src/
├── index.js                    Bot principal + cache de convites
├── config.js                   Configurações globais
├── deploy-commands.js          Registrar 22 comandos slash
│
├── commands/
│   ├── loja/                   12 comandos de usuário (inclui /convites)
│   └── admin/                  9 comandos administrativos
│
├── systems/
│   ├── loja.js                 PIX + Boleto + entrega no privado
│   ├── efi.js                  EFI Bank (PIX/boleto/webhook)
│   ├── tickets.js              Abertura, fechamento, transcript HTML
│   ├── caixaMisteriosa.js      Sorteio, animação, entrega
│   ├── painelAdmin.js          Painel admin com todos os submenus
│   ├── painelProduto.js        Builder visual de carrinhos
│   ├── coins.js                Compra, gasto, transferência de coins
│   ├── codigosCoins.js         Geração e resgate de códigos
│   ├── i18n.js                 Traduções PT-BR/EN/FR/HI/ES
│   ├── afiliados.js            Comissões e saque
│   ├── cupons.js               Criação e validação
│   ├── flashsale.js            Ofertas relâmpago
│   ├── antiFraude.js           Cooldown e bloqueio
│   ├── cargosAutomaticos.js    Cliente/Premium/Supremo automático
│   └── anuncios.js             DM em massa
│
├── handlers/
│   ├── buttons.js              Handler central de botões
│   ├── painelButtons.js        Botões do painel admin
│   ├── painelProdutoHandler.js Compras pelo painel
│   ├── selectMenus.js          Select menus (loja, idioma, caixa)
│   └── modals.js               Todos os modais
│
├── database/
│   ├── database.js             23+ tabelas + helpers CRUD
│   └── sqlite-sync.js          Wrapper síncrono sobre sql.js (WASM)
│
├── events/
│   ├── guildMemberAdd.js       Criar perfil + sistema de convites
│   └── messageCreate.js        !coins / !saldo + contar msgs tickets
│
├── tasks/
│   └── scheduler.js            6 cron jobs (expira pedidos, fecha tickets,
│                               relatório diário para owner, estoque baixo,
│                               limpa carrinho, lembretes)
│
├── utils/
│   ├── logger.js               Salva no banco, webhook para críticos
│   ├── embeds.js               Builders reutilizáveis
│   └── permissions.js          Hierarquia de cargos
│
└── webhook/
    └── server.js               Express — recebe PIX confirmado EFI Bank
```

---

## ⚙️ Variáveis de Ambiente

```env
# Discord
DISCORD_TOKEN=
CLIENT_ID=1533637582393446561
GUILD_ID=1522456699082903572

# EFI Bank
EFI_CLIENT_ID=Client_Id_...
EFI_CLIENT_SECRET=Client_Secret_...
EFI_PIX_KEY=c5fd3240-030d-4b86-9659-84135b595c21
EFI_CERTIFICATE_PATH=./producao-940835-Loja 2.0.p12
EFI_SANDBOX=false

# Webhooks
WEBHOOK_PORT=3000
WEBHOOK_URL=https://SEU-DOMINIO.railway.app/webhook
DISCORD_WEBHOOK_LOGS=https://discord.com/api/webhooks/...

# Canais
CATEGORY_TICKETS=1522657546345779360
CANAL_LOGS=1530046463927648368
CANAL_LOJA=1544177169440317440

# Cargos
CARGO_OWNER=1522459532469469225
CARGO_ADMIN=1522458772801458236
CARGO_LOJA=1522806323446681741
CARGO_ACEITAR_COMPRA=1522791855597555842
CARGO_MOD=1522459007854575697
CARGO_SUPORTE=1522457765161992292
CARGO_CLIENTE_SUPREMO=1522458063573880984
CARGO_CLIENTE_PREMIUM=1522457266119512114
CARGO_CLIENTE=1522457009931419748
```

---

## 🚂 Deploy no Railway

1. Push para GitHub (sem `.env`)
2. Novo projeto Railway → conectar repo
3. Adicionar variáveis de ambiente
4. O domínio gerado é o `WEBHOOK_URL`
5. Registrar webhook PIX (uma vez após deploy):

```bash
node -e "
require('dotenv').config();
require('./src/systems/efi')
  .registrarWebhook(process.env.WEBHOOK_URL + '/pix')
  .then(r => console.log('OK:', JSON.stringify(r)))
  .catch(console.error)
"
```

---

## 📊 Scheduler — Tarefas Automáticas

| Quando | O que faz |
|---|---|
| A cada 10 min | Cancela pedidos pendentes há +35 min |
| A cada 1h | Fecha tickets inativos há +24h + gera transcript |
| Diariamente às 8h | Relatório enviado por DM para o Owner |
| A cada 6h | Alerta de estoque baixo |
| Meia-noite | Limpa carrinhos abandonados |
| A cada 15 min | Lembra usuários de pedidos pendentes por DM |
