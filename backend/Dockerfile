# 1. Use an official, lightweight Node.js image as our base operating system
FROM node:18-alpine

# 2. Create a folder inside the container to hold our app
WORKDIR /app

# 3. Copy ONLY the package files first (this makes building much faster)
COPY package*.json ./

# 4. Install the dependencies (socket.io, express, etc.)
RUN npm install

# 5. Copy the rest of your backend code into the container
COPY . .

# 6. Expose the port (Render will override this, but it's good practice)
EXPOSE 5001

# 7. The exact command to start your server
CMD ["node", "server.js"]