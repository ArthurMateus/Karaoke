FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit

COPY . .

# "npm install" again on start so new packages show up without rebuilding the image.
CMD ["sh", "-c", "npm install --no-fund --no-audit && npm run dev"]
