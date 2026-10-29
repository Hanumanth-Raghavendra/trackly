# syntax=docker/dockerfile:1
#
# Trackly web app for `docker compose up`: Vite builds static files, nginx serves them and
# proxies /api and /socket.io to the two backends, so the browser sees one origin, exactly
# like production on Vercel.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
