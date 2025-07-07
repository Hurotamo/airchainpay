FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Create data and logs directories
RUN mkdir -p data logs
RUN chmod -R 755 data logs

# Expose port
EXPOSE 4000

# Run as non-root user for better security
USER node

# Start the server (NODE_ENV will be set by docker-compose or environment)
CMD ["node", "src/server.js"] 