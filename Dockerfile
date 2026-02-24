FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install
RUN DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" npm run build
ENV NODE_ENV=production
EXPOSE 5000
CMD ["npm", "start"]