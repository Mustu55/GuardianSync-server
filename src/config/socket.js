const { Server } = require('socket.io');
const { corsOrigin } = require('./env');

let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    socket.on('join:industry', (industry, callback) => {
      try {
        if (!industry || typeof industry !== 'string') {
          return callback?.({ error: 'Invalid industry' });
        }
        socket.join(industry);
        console.log(`📡 ${socket.id} joined industry: ${industry}`);
        callback?.({ success: true });
      } catch (error) {
        console.error('Error joining industry:', error);
        callback?.({ error: error.message });
      }
    });

    socket.on('leave:industry', (industry, callback) => {
      try {
        if (industry) socket.leave(industry);
        callback?.({ success: true });
      } catch (error) {
        console.error('Error leaving industry:', error);
        callback?.({ error: error.message });
      }
    });

    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Client disconnected: ${socket.id} (reason: ${reason})`);
    });
  });

  io.on('error', (error) => {
    console.error('Socket.io error:', error);
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

const emitEvent = (event, data, room = null) => {
  if (!io) return;
  if (room) {
    io.to(room).emit(event, data);
  } else {
    io.emit(event, data);
  }
};

module.exports = { initSocket, getIO, emitEvent };
