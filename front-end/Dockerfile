# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=23.10.0
FROM node:${NODE_VERSION}-slim AS base

# Install packages needed to build node modules
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3

# Set up pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

LABEL fly_launch_runtime="Vite"

# Vite app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base AS build


# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package.json files for all workspace packages (for layer caching)
COPY shared/package.json ./shared/
COPY front-end/package.json ./front-end/

# Install all dependencies (including workspace packages)
RUN pnpm install --frozen-lockfile=true --prod=false

# Build shared package first
COPY shared/ ./shared/
RUN cd shared && pnpm run build && rm -rf src/

# Build front-end
COPY front-end/ ./front-end/
RUN cd front-end && pnpm run build


# Final stage for app image
FROM nginx

# Copy built application
COPY --from=build /app/front-end/dist /usr/share/nginx/html

# Copy custom nginx configuration with COOP/COEP headers
COPY front-end/nginx.conf /etc/nginx/conf.d/default.conf

# Setup sqlite3 on a separate volume
RUN mkdir -p /data
VOLUME /data

# Start the server by default, this can be overwritten at runtime
EXPOSE 80
CMD [ "/usr/sbin/nginx", "-g", "daemon off;" ]
