const errorHandler = (err, req, res, _next) => {
  const status = err.statusCode || err.status || 500;
  const isDev = process.env.NODE_ENV === 'development';
  
  console.error(`❌ [${status}] ${err.message}`, {
    path: req.path,
    method: req.method,
    ...(isDev && { stack: err.stack }),
  });

  res.status(status).json({
    error: err.message || 'Internal server error',
    ...(isDev && { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });
};

module.exports = errorHandler;
