FROM node:20

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig*.json ./

RUN npm ci
RUN npx prisma generate

COPY src ./src
COPY scripts ./scripts

RUN npm run build

ENV NODE_ENV=production

CMD ["npm", "run", "start:prod"]
