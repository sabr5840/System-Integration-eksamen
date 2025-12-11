# payment-service/Dockerfile
FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production

COPY src ./src

EXPOSE 4002

CMD ["node", "src/index.js"]
