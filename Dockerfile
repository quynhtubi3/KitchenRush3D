FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/content/package.json packages/content/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM build AS server
ENV NODE_ENV=production
EXPOSE 2567
USER node
CMD ["npm", "run", "start", "-w", "@kitchen/server"]

FROM nginx:stable-alpine AS client
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
