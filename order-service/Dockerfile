# order-service/Dockerfile
FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --only=production

COPY src ./src

EXPOSE 4000

CMD ["node", "src/index.js"]
