FROM node:20-alpine

# Instalar dependências do sistema para better-sqlite3 e canvas
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    librsvg-dev \
    pixman-dev \
    fontconfig \
    ttf-freefont

WORKDIR /app

# Copiar package files primeiro (cache de layers)
COPY package*.json ./

# Instalar dependências
RUN npm ci --omit=dev

# Copiar código fonte
COPY . .

# Criar diretórios necessários
RUN mkdir -p data certs

# Expor porta do webhook
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Variável de ambiente para timezone
ENV TZ=America/Sao_Paulo

# Iniciar bot
CMD ["node", "src/index.js"]
