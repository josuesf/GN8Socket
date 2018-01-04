var express = require('express');
var http = require('http')
var socketio = require('socket.io');
var mongojs = require('mongojs');

var multer = require('multer')
var aws = require('aws-sdk')
var multerS3 = require('multer-s3')

var ObjectID = mongojs.ObjectID; //mongodb://<dbuser>:<dbpassword>@ds157653.mlab.com:57653/gn8db
var db = mongojs(process.env.MONGO_URL || 'mongodb://gn8user:#goodNight@ds157653.mlab.com:57653/gn8db');
var app = express();
var server = http.createServer(app);
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
var s3 = new aws.S3({
  accessKeyId: process.env.S3_KEY,
  secretAccessKey: process.env.S3_SECRET
})
var storage = multerS3({
  s3: s3,
  bucket: 'gn8images',
  acl: 'public-read',
  metadata: function (req, file, cb) {
    cb(null, { fieldName: file.fieldname })
  },
  key: function (req, file, cb) {
    cb(null, file.originalname)
  }
})
var upload = multer({ storage: storage })

app.post('/ws/create_post', upload.single('picture'), function (req, res, next) {
  var inputs = req.body;

  // if (!inputs.nombre_post || !inputs.descripcion || !inputs.id_usuario
  //   || !inputs.codigoQR ||
  //   !inputs.nombre_usuario || !inputs.photo_url)
  //   return res.json({ res: "error", detail: "Complete todos los campos" })
  var photo_post = 'https://s3.us-east-2.amazonaws.com/gn8images/'+req.file.originalname;
  var post = {
    nombre_post: inputs.nombre_post,
    photo_post: photo_post,
    descripcion: inputs.descripcion,
    id_usuario: inputs.id_usuario,
    nombre_usuario: inputs.nombre_usuario,
    photo_url: inputs.photo_url,
    likesCount: 0,
    liked: {},
    commentsCount: 0,
    codigoqr: inputs.codigoqr=='1'?true:false,
    codigoqr_des:inputs.codigoqr_des,
    createdAt: new Date(),
    updateAt: new Date()
  }
 
  db.collection('posts').insert(post, (err, post) => {
    if (err) return res.json({ res: "error", detail: err })
    // enviar a todos los sockets que estan escuchando
    websocket.emit('posts', post);
    //Enviar respueta post
    return res.json({ res: "ok", post })
  });

});
app.post('/ws/posts/', function (req, res) {
  var posts = db.collection('posts')
    .find({})
    .sort({ createdAt: -1 })
    .toArray((err, posts) => {
      // If there aren't any posts, then return.
      if (!posts.length) return res.json({ res: "error", post: [] });
      res.json({ res: "ok", posts });
    });
})
/**
 * Comentarios de un post
 */
app.post('/ws/comments', function (req, res) {
  var messages = db.collection('message')
    .find({ id_post: req.body.id_post })
    //.sort({ createdAt: 1 })
    .toArray((err, messages) => {
      // If there aren't any messages, then return.
      if (!messages.length) return res.json({ res: "error", comments: [] });
      res.json({ res: "ok", comments: messages });
    });

});




websocket.on('connection', (socket) => {
  socket.on('message', (message) => _sendAndSaveMessage(message, socket));
  socket.on('like_post', (like) => _guardarLikePost(like, socket))
  socket.on('disconnect', function () {
    console.log('se desconecto', socket.id)

  });
});


// Save the message to the db and send all sockets but the sender.
function _sendAndSaveMessage(message, socket, fromServer) {
  var messageData = {
    text: message.text,
    user: message.user,
    photo_url: message.photo_url,
    id_post: message.id_post,
    id_user: message.id_user,
    createdAt: new Date(),
    updateAt: new Date()
  };

  db.collection('message').insert(messageData, (err, message) => {
    console.log(message.id_post)
    const id = mongojs.ObjectId(message.id_post)
    db.collection('posts').update(
      { _id: id }, { $inc: { commentsCount: 1 } }, function (err, post) {
        // the update is complete 
        if (err) console.log(err)
        // If the message is from the server, then send to everyone.
        var emitter = fromServer ? websocket : socket.broadcast;
        websocket.emit('message', [message]);
      })
  });
}
function _guardarLikePost(like, socket) {
  const id = mongojs.ObjectId(like.id_post)
  const campo = "liked." + like.id_user
  db.collection('posts').update(
    { _id: id },
    {
      $set: { [campo]: like },
      $inc: { likesCount: like.like ? 1 : -1 }
    }, function (err, res) {
      // the update is complete 
      console.log(res)
      if (err) console.log(err)
      // If the message is from the server, then send to everyone.
      var emitter = socket.broadcast;
      emitter.emit('like_post', like);
    })
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