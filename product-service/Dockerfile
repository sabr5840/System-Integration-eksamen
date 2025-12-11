# product-service/Dockerfile
FROM node:18-alpine

# Arbejdsmappen i containeren
WORKDIR /usr/src/app

# Kopiér package-filer først (bedre cache)
COPY package*.json ./

# Installer dependencies
RUN npm install --only=production

# Kopiér resten af koden
COPY src ./src

# Expose port (samme som i din app)
EXPOSE 4001

# Start kommando
CMD ["node", "src/index.js"]
