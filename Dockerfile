FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source
COPY . .

# Set dummy DATABASE_URL for build/generate (satisfied by prisma.config.ts)
ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"

# Build the application (this runs prisma generate)
RUN npx prisma generate
RUN npm run build

# Remove Dummy URL and set production
ENV DATABASE_URL=""
ENV NODE_ENV=production

EXPOSE 5000

# Start command (using npm start which now contains db push)
CMD ["npm", "start"]