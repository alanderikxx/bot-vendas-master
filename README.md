# 🛍️ Máximo Store — Bot de Vendas Discord

Bot completo de loja digital para Discord com sistema de tickets, pagamentos PIX/Boleto, coins, cupons, caixas misteriosas e painel admin completo.

---

## 📋 Índice

- [Funcionalidades](#-funcionalidades)
- [Tecnologias](#-tecnologias)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Estrutura do Projeto](#-estrutura-do-projeto)
- [Sistemas](#-sistemas)
- [Painel Admin](#-painel-admin)
- [Deploy (Railway)](#-deploy-railway)
- [Changelog](#-changelog)

---

## ✨ Funcionalidades

### 🛒 Loja
- Painéis de produto com select menu por canal
- Múltiplos planos por produto (variantes com preço individual)
- Estoque digital (1 item por linha, entregue automaticamente)
- Notificação automática quando estoque zera ou fica baixo
- Aviso por DM quando estoque de produto sem estoque voltar
- Recompra com 1 clique no histórico

### 💳 Pagamentos
- **PIX** via EFI Bank (Gerencianet) com QR Code gerado automaticamente
- **Coins** — moeda interna (100 coins = R$1,00)
- **Boleto** bancário via EFI Bank
- Temporizador visível do PIX no ticket (`<t:timestamp:R>`)
- Verificação automática de pagamento (polling a cada 50s)

### 🎫 Tickets
- Abertura automática ao comprar
- Fila de atendimento com posição exibida ao cliente
- Boas-vindas personalizada com nome do produto
- Botões: PIX, Coins, Quantidade, Cupom, Cancelar
- Liberar produto sem pagamento (cargo **Aceitar Compra**)
- Confirmação antes de cancelar pedido
- Transcrição HTML enviada ao cliente ao fechar

### 🪙 Coins
- KPI de ranking top 25 com barra de progresso (atualiza a cada 8s)
- Gerar códigos de coins com envio direto por DM
- Dar coins para todos os usuários de uma vez
- Sistema de convites: +15 coins ao usar código, +5 ao ser indicado
- Ranking em tempo real no canal dedicado

### 🎟️ Cupons
- Desconto percentual
- Limite de usos por usuário
- Validade configurável em dias
- Restrição por loja específica (IDs de produto)
- Publicar embed do cupom no canal de promoções com 1 clique
- Código automático se não informado

### 🎁 Caixas Misteriosas
- Itens com raridade e chance configurável
- Pagamento via PIX/Coins
- Histórico de aberturas

### 🛡️ Anti-Fraude
- Rate limiting: 3 tentativas em 10 minutos
- Auto-bloqueio após 6 tentativas na janela
- Blacklist por CPF (boleto)
- Bloqueio de pedido duplicado do mesmo produto em 10 min

### 📊 Analytics & Logs
- Relatório de vendas por período (Hoje / 7 dias / 30 dias / Total)
- Exportar CSV com todos os pedidos
- Gráfico de barras dos últimos 7 dias (canvas no Railway, ASCII como fallback)
- **12 canais de log** em servidor dedicado:
  - Log 1 → Vendas/Compras
  - Log 2 → Pagamentos
  - Log 3 → Entregas
  - Log 4 → Tickets abertos
  - Log 5 → Tickets fechados
  - Log 6 → Reembolsos
  - Log 7 → Fraudes/Segurança
  - Log 8 → Sistema/Config
  - Log 9 → Estoque baixo
  - Log 10 → Afiliados
  - Log 11 → Caixas
  - Log 12 → Erros
- 3 webhooks por categoria (Vendas, Operações, Sistema)

---

## 🔧 Tecnologias

| Tecnologia | Uso |
|---|---|
| [Discord.js v14](https://discord.js.org/) | Framework principal |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Banco de dados SQLite |
| [EFI Bank SDK](https://dev.efipay.com.br/) | Pagamentos PIX/Boleto |
| [canvas](https://www.npmjs.com/package/canvas) | Gráficos de analytics |
| [moment-timezone](https://momentjs.com/timezone/) | Formatação de datas |
| [node-cron](https://www.npmjs.com/package/node-cron) | Tarefas agendadas |
| [Railway](https://railway.app/) | Hospedagem |

---

## 🚀 Instalação

```bash
# Clonar o repositório
git clone https://github.com/alanderikxx/bot-vendas-master.git
cd bot-vendas-master

# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# Registrar comandos slash
node src/deploy-commands.js

# Iniciar o bot
node src/index.js
```

---

## ⚙️ Configuração

Copie `.env.example` para `.env` e preencha:

```env
# Discord
DISCORD_TOKEN=seu_token
CLIENT_ID=id_do_bot
GUILD_ID=id_do_servidor

# EFI Bank (Pagamentos)
EFI_CLIENT_ID=Client_Id_...
EFI_CLIENT_SECRET=Client_Secret_...
EFI_PIX_KEY=sua_chave_pix
EFI_SANDBOX=false

# Certificado EFI (Railway — base64)
EFI_CERTIFICATE_BASE64=base64_do_certificado_p12

# Canais
CATEGORY_TICKETS=id_categoria
CANAL_LOGS=id_canal_logs
CANAL_LOJA=id_canal_loja

# Cargos
CARGO_OWNER=id
CARGO_ADMIN=id
CARGO_LOJA=id
CARGO_ACEITAR_COMPRA=id
CARGO_SUPORTE=id
```

### Gerar CERTIFICATE_BASE64 localmente (Windows PowerShell):
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes(".\seu-certificado.p12"))
```

---

## 📁 Estrutura do Projeto

```
src/
├── commands/
│   ├── admin/          # Comandos administrativos
│   └── loja/           # Comandos da loja (/loja, /historico, /pedidos...)
├── database/
│   ├── database.js     # Inicialização e helpers do banco
│   └── sqlite-sync.js  # Wrapper better-sqlite3
├── events/
│   ├── guildMemberAdd.js   # Sistema de convites
│   └── messageCreate.js    # Eventos de mensagem
├── handlers/
│   ├── buttons.js          # Handler de botões
│   ├── modals.js           # Handler de modais
│   ├── selectMenus.js      # Handler de select menus
│   ├── painelButtons.js    # Painel legado (/painel-admin)
│   └── painelProdutoHandler.js
├── systems/
│   ├── adminSubmenus.js    # Submenus: plano, estoque, cupom
│   ├── antiFraude.js       # Rate limit, blacklist CPF
│   ├── carrinho.js         # Sistema de carrinho
│   ├── caixaMisteriosa.js  # Caixas misteriosas
│   ├── codigosCoins.js     # Códigos de coins resgatáveis
│   ├── coins.js            # Sistema de coins
│   ├── criarCarrinhoSub.js # Submenu criar/editar carrinho
│   ├── cupons.js           # Sistema de cupons
│   ├── efi.js              # Integração EFI Bank (PIX/Boleto)
│   ├── i18n.js             # Internacionalização (PT/EN/ES)
│   ├── loja.js             # Core da loja
│   ├── painelAdmin.js      # Painel administrativo
│   ├── painelProduto.js    # Builder de painéis de produto
│   ├── sistemaConvite.js   # Sistema de convites/referral
│   └── tickets.js          # Sistema de tickets
├── tasks/
│   └── scheduler.js        # Tarefas agendadas + KPI coins
├── utils/
│   ├── embeds.js           # Embeds padronizados
│   ├── logger.js           # Logger com 12 canais + 3 webhooks
│   └── permissions.js      # Verificação de cargos
├── webhook/
│   └── server.js           # Servidor webhook EFI
└── index.js                # Ponto de entrada
```

---

## 🎛️ Painel Admin

Acessível pelo canal fixo configurado. Organizado por nível de acesso:

### Cargo Loja+ vê:
- **🛒 Menu Loja**: Criar/editar carrinhos, adicionar planos e estoque, cupons

### Cargo Admin+ vê tudo acima mais:
- **⚙️ Operações**: Tickets, reembolsos, pedidos pendentes, flash sale, relatórios, busca por pedido
- **👥 Usuários**: Buscar usuário, gerenciar coins, ranking, blacklist CPF
- **🎁 Caixas**: Criar e gerenciar caixas misteriosas

### Fluxo para criar um produto:
1. **➕ Criar** — define nome, canal, imagem e cor via submenu interativo
2. **＋ Plano** — adiciona planos com preço (select de produto + modal)
3. **📥 Estoque** — cola itens (até 4 slots com múltiplas linhas cada)
4. Produto publicado automaticamente no canal escolhido

---

## 🚂 Deploy (Railway)

1. Fork/clone o repositório para sua conta GitHub
2. Crie um projeto no [Railway](https://railway.app/)
3. Conecte o repositório
4. Configure as variáveis de ambiente (Settings → Variables)
5. Adicione um **Volume** em `/app/data` para persistência do banco
6. Configure `DB_PATH=/app/data/database.db`

### Variável de certificado EFI:
Cole o base64 do certificado `.p12` diretamente na variável `EFI_CERTIFICATE_BASE64` no Railway.

---

## 📝 Changelog

### Versão atual (setembro 2026)

**Novas funcionalidades:**
- Submenus interativos para criar carrinho, planos, estoque e cupons
- KPI de ranking de coins com barra de progresso em tempo real
- Sistema de notificação "avise quando voltar" para produtos sem estoque
- Recompra com 1 clique no histórico
- Fila de atendimento visível no ticket
- Temporizador do PIX com contagem regressiva
- Confirmação antes de cancelar pedido
- Gráfico de vendas dos últimos 7 dias
- Exportar relatório CSV de vendas
- Blacklist por CPF
- Busca de pedido por ID no painel
- Editar preço/nome de plano sem recriar
- Últimos pedidos visíveis no perfil do usuário
- 12 canais de log em servidor dedicado

**Correções críticas:**
- `menuCaixas` e `historicoCaixas` eram undefined (crashes silenciosos)
- Handler duplicado de `modal_cupom_` — cupom no ticket nunca funcionava
- `iniciarCompraCaixa` chamada sem o parâmetro `client`

**Otimizações:**
- Cache de 30s nas stats do painel (evita 10 sub-selects por clique)
- Webhook de avaliações como instância global
- Imports mortos removidos (`liberarSemPagamento`, `solicitarReembolso`, etc.)
- Embeds padronizados com `>` blockquote e footer consistente

---

## 📄 Licença

Projeto privado — Máximo Store © 2026
