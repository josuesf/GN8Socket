var express = require('express');
var http = require('http')
var socketio = require('socket.io');
var mongojs = require('mongojs');

var ObjectID = mongojs.ObjectID; //mongodb://<dbuser>:<dbpassword>@ds157653.mlab.com:57653/gn8db
var db = mongojs(process.env.MONGO_URL || 'mongodb://gn8user:#goodNight@ds157653.mlab.com:57653/gn8db');
var app = express();
var server = http.Server(app);
var websocket = socketio(server);
var port = process.env.PORT || 8080;
server.listen(port, () => console.log('listening on ' + port));
var bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.get('/', function (req, res) {
  res.send('Hello World!');
});
/**
 * Creacion de un post
 * Paramentros : nombre_post,descripcion,id_usuario,likesCount,liked,codigoQR,createdAt,updateAt
 */
app.post('/ws/create_post', function (req, res) {
  var inputs = req.body;
  if (!inputs.nombre_post || !inputs.descripcion || !inputs.id_usuario ||
    !inputs.likesCount || !inputs.liked || !inputs.codigoQR ||
    !inputs.nombre_usuario||!inputs.photo_url)
    return res.json({ res: "error", detail: "Complete todos los campos" })
  var photo_post='';
  var post = {
    nombre_post: inputs.nombre_post,
    photo_post:photo_post,
    descripcion: inputs.descripcion,
    id_usuario: inputs.id_usuario,
    nombre_usuario:inputs.nombre_usuario,
    photo_url:inputs.photo_url,
    likesCount: inputs.likesCount,
    liked: inputs.liked,
    codigoQR: inputs.codigoQR,
    createdAt: new Date(),
    updateAt: new Date()
  }

  db.collection('posts').insert(post, (err, post) => {
    if (err) return res.json({ res: "error", detail: err })
    // enviar a todos los sockets que estan escuchando
    websocket.emit('message', [post]);
    //Enviar respueta post
    return res.json({ res: "ok", post })
  });

});
app.post('/ws/posts/',function(req,res){
  var posts = db.collection('posts')
    .find({})
    .sort({ createdAt: 1 })
    .toArray((err, posts) => {
      // If there aren't any posts, then return.
      if (!posts.length) return res.json({ res: "error", post: [] });
      res.json({res:"ok",posts});
    });
})
/**
 * Comentarios de un post
 */
app.post('/ws/comments', function (req, res) {
  var messages = db.collection('message')
    .find({id_post:req.body.id_post})
    //.sort({ createdAt: 1 })
    .toArray((err, messages) => {
      // If there aren't any messages, then return.
      if (!messages.length) return res.json({ res: "error", comments: [] });
      res.json({res:"ok",comments:messages});
    });

});




websocket.on('connection', (socket) => {
  socket.on('message', (message) => _sendAndSaveMessage(message, socket));
});


// Save the message to the db and send all sockets but the sender.
function _sendAndSaveMessage(message, socket, fromServer) {
  var messageData = {
    text: message.text,
    user: message.user,
    photo_url: message.photo_url,
    id_post: message.id_post,
    id_user: message.id_user
  };

  db.collection('message').insert(messageData, (err, message) => {
    // If the message is from the server, then send to everyone.
    var emitter = fromServer ? websocket : socket.broadcast;
    emitter.emit('message', [message]);
  });
}

// Allow the server to participate in the chatroom through stdin.
var stdin = process.openStdin();
stdin.addListener('data', function (d) {
  _sendAndSaveMessage({
    text: d.toString().trim(),
    createdAt: new Date(),
    user: { _id: 'robot' }
  }, null /* no socket */, true /* send from server */);
});