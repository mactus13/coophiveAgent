FROM node:16-slim

RUN mkdir /app
WORKDIR /app

COPY . .
RUN npm install
EXPOSE 3000
CMD ["node", "entrypoint.js"]
