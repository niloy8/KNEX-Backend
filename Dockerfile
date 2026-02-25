# FROM node:22-alpine

# WORKDIR /app

# # Install dependencies first for better caching
# COPY package*.json ./
# RUN npm install

# # Copy source
# COPY . .

# # Set dummy DATABASE_URL for build/generate (satisfied by prisma.config.ts)
# ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
# RUN npm install --production
# # Build the application (runs prisma generate AND tsc)
# RUN npm run build

# # Remove Dummy URL and set production
# ENV DATABASE_URL=""
# ENV NODE_ENV=production

# EXPOSE 5000

# # Start command
# CMD ["node", "dist/index.js"]

# FROM node:22-alpine

# WORKDIR /app

# COPY package*.json ./
# RUN npm install --production

# COPY . .

# # Build TS and generate Prisma client
# RUN npm run build

# # Production env
# ENV NODE_ENV=production

# EXPOSE 5000

# # Safe production start: run migrations before starting app
# CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

# Dockerfile snippet

FROM node:22-alpine
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install ALL dependencies (needed for build)
RUN npm install '--omit=dev'

# Copy project files
COPY . .

# Set temporary dummy DATABASE_URL so prisma generate works at build
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
RUN npx prisma generate

# Build TypeScript using npx
RUN npx tsc

# Remove dev dependencies to reduce image size (optional)
RUN npm prune --production

# Set production environment
ENV NODE_ENV=production

# Expose port
EXPOSE 5000

# Run migrations at container start with real DB
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]