const express = require('express');
const { buildCors } = require('./middleware/cors');

const chatRoute  = require('./routes/chat');
const pulseRoute = require('./routes/pulse');

const app  = express();
const PORT = process.env.PORT || 8080;

app.use(buildCors());

// health
app.get('/health', (req,res)=> res.json({ status:'ok', ts: Date.now() }));

// routes
app.use('/api/chat',  chatRoute);
app.use('/api/pulse', pulseRoute);

// fallback 404
app.use((req,res)=> res.status(404).json({ error:'Not found' }));

app.listen(PORT, ()=> {
  console.log(`[kira] api listening on :${PORT}`);
});
