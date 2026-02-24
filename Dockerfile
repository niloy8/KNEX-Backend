FROM node:22-alpine

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Set dummy DATABASE_URL for build/generate (satisfied by prisma.config.ts)
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"

# Build the application (runs prisma generate AND tsc)
RUN npm run build

# Remove Dummy URL and set production
ENV DATABASE_URL=""
ENV NODE_ENV=production

EXPOSE 5000

# Start command
CMD ["npm", "start"]