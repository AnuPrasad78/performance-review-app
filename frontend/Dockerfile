# Performance Review web front end for Azure Container Apps.
#
# The SPA and the API share one origin: nginx serves the built assets and
# reverse-proxies /api/* to the API container app over the environment's
# private network. That keeps the API off the public internet, removes CORS
# from production, and means the image is environment-agnostic — the API
# address is runtime configuration (API_UPSTREAM), not baked in at build time.
#
# Build from frontend/:  docker build -t performance-review-web .

FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Same-origin: leave VITE_API_URL unset so the client calls relative /api.
RUN npm run build


FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Where nginx forwards /api — the API app's in-environment address.
ENV API_UPSTREAM=http://performance-review-api

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
