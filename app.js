var express = require('express');
var http = require('http')
var socketio = require('socket.io');
var mongojs = require('mongojs');

var multer = require('multer')
var aws = require('aws-sdk')
var multerS3 = require('multer-s3')

var ObjectID = mongojs.ObjectID; //mongodb://<dbuser>:<dbpassword>@ds157653.mlab.com:57653/gn8db
var db = mongojs(process.env.MONGO_URL);
var app = express();
var server = http.createServer(app);
var websocket = socketio(server);
var port = process.env.PORT || 8080;
server.listen(port, () => console.log('listening on ' + port));
var bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies
//app.use('/uploads', express.static('uploads'));
app.use(session({secret: '_secret_', cookie: { maxAge: 60 * 60 * 1000 }, saveUninitialized: false, resave: false}));

// configurate static 
app.use(express.static(__dirname + '/public'));
app.use('/assets',  express.static(__dirname + '/assets'));
 
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
  bucket: 'gn8bucket',
  acl: 'public-read',
  metadata: function (req, file, cb) {
    cb(null, { fieldName: file.fieldname })
  },
  key: function (req, file, cb) {
    cb(null, file.originalname)
  }
})
/*var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  }
})*/
var upload = multer({ storage: storage })

app.post('/ws/create_post', upload.single('picture'), function (req, res, next) {
  var inputs = req.body;
  console.log(inputs)
  // if (!inputs.nombre_post || !inputs.descripcion || !inputs.id_usuario
  //   || !inputs.codigoQR ||
  //   !inputs.nombre_usuario || !inputs.photo_url)
  //   return res.json({ res: "error", detail: "Complete todos los campos" })
  var photo_post = 'https://s3-sa-east-1.amazonaws.com/gn8bucket/' + req.file.originalname;
  var post = {
    nombre_post: inputs.nombre_post,
    photo_post: photo_post,
    descripcion: inputs.descripcion,
    id_usuario: mongojs.ObjectId(inputs.id_usuario),
    nombre_usuario: inputs.nombre_usuario,
    photo_url: inputs.photo_url,
    likesCount: 0,
    liked: {},
    commentsCount: 0,
    codigoqr: inputs.codigoqr == '1' ? true : false,
    codigoqr_des: inputs.codigoqr_des,
    latitude: inputs.latitude,
    longitude: inputs.longitude,
    geo: [parseFloat(inputs.longitude), parseFloat(inputs.latitude)],
    categorias: inputs.categorias,
    fecha_evento: new Date(inputs.fecha_evento),
    limite_codigos: parseInt(inputs.limite_codigos),
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
app.post('/ws/generarCodigoQR', function (req, res) {
  var inputs = req.body

  var invitacion = {
    id_post: mongojs.ObjectId(inputs.id_post),
    id_usuario_invitado: mongojs.ObjectId(inputs.id_usuario_invitado),
    nombre_post: inputs.nombre_post,
    photo_post: inputs.photo_post,
    codigoqr_des: inputs.codigoqr_des,
    id_usuario: mongojs.ObjectId(inputs.id_usuario),
    nombre_usuario: inputs.nombre_usuario,
    nombre_usuario_invitado: inputs.nombre_usuario_invitado,
    photo_url: inputs.photo_url,
    estado: "WAIT",
    createdAt: new Date(),
    updateAt: new Date()
  }

  db.collection('invitaciones').insert(invitacion, (err, invitacion) => {
    if (err) return res.json({ res: "error", detail: err })
    db.collection('posts').update(
      { _id:  mongojs.ObjectId(inputs.id_post) }, { $inc: { limite_codigos: -1 } }, (err, post) =>{
        if (err) return res.json({ res: "error", detail: err })
        // the update is complete 
        return res.json({ res: "ok", invitacion })
      })
    
  });
});
app.post('/ws/posts/', function (req, res) {
  var query = req.body.categoria
  var posts = db.collection('posts')
    .find({ categorias: { $regex: query, $options: "i" } })
    .skip(10 * (req.body.page - 1)).limit(10)
    .sort({ createdAt: -1 })
    .toArray((err, posts) => {
      // If there aren't any posts, then return.
      if (err) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", posts });
    });
})
app.post('/ws/posts_guardados/', function (req, res) {
  const campo = "saved." + req.body.id_usuario
  console.log(campo)
  var posts = db.collection('posts')
    .find({ [campo]: true })
    .skip(10 * (req.body.page - 1)).limit(10)
    .sort({ createdAt: -1 })
    .toArray((err, posts) => {
      // If there aren't any posts, then return.
      if (err) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", posts });
    });
})
app.post('/ws/posts_user/', function (req, res) {
  var posts = db.collection('posts')
    .find({ id_usuario: mongojs.ObjectId(req.body.id_usuario) })
    .skip(3 * (req.body.page - 1)).limit(3)
    .sort({ createdAt: -1 })
    .toArray((err, posts) => {
      // If there aren't any posts, then return.
      if (err) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", posts });
    });
})
app.post('/ws/listaEmpresas/', function (req, res) {
  var posts = db.collection('users')
    .find({ es_empresa: req.body.es_empresa })
    .skip(8 * (req.body.page - 1)).limit(8)
    //.sort({ createdAt: -1 })
    .toArray((err, empresas) => {
      // If there aren't any posts, then return.
      if (err) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", empresas });
    });
})
app.post('/ws/buscarUsuarios/', function (req, res) {
  var query = req.body.name
  var posts = db.collection('users')
    .find({ name: { $regex: query, $options: "i" } })
    //.skip(8 * (req.body.page - 1)).limit(8)
    //.sort({ createdAt: -1 })
    .toArray((err, empresas) => {
      // If there aren't any posts, then return.
      if (err) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", empresas });
    });
})
app.post('/ws/invitaciones_user/', function (req, res) {
  var invitaciones = db.collection('invitaciones')
    .find({ id_usuario_invitado: mongojs.ObjectId(req.body.id_usuario_invitado), estado: "WAIT" })
    .skip(10 * (req.body.page - 1)).limit(10)
    .sort({ createdAt: -1 })
    .toArray((err, invitaciones) => {
      // If there aren't any posts, then return.
      if (err) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", invitaciones });
    });
})
app.post('/ws/invitaciones_user_check/', function (req, res) {
  var invitaciones = db.collection('invitaciones')
    .find({
      id_usuario_invitado: mongojs.ObjectId(req.body.id_usuario_invitado),
      estado: "CHECK"
    })
    .skip(10 * (req.body.page - 1)).limit(10)
    .sort({ createdAt: -1 })
    .toArray((err, invitaciones) => {
      // If there aren't any posts, then return.
      if (err) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", invitaciones });
    });
})
app.post('/ws/getCodigo_Usuario/', function (req, res) {
  var posts = db.collection('invitaciones')
    .find({
      id_post: mongojs.ObjectId(req.body.id_post),
      id_usuario_invitado: mongojs.ObjectId(req.body.id_usuario_invitado)
    })
    .toArray((err, invitacion) => {
      // If there aren't any posts, then return.
      if (err) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", invitacion });
    });
})
app.post('/ws/VerificacionCodigo/', function (req, res) {
  var posts = db.collection('invitaciones')
    .findAndModify({
      query: {
        _id: mongojs.ObjectId(req.body.id_qr),
        id_usuario: mongojs.ObjectId(req.body.id_usuario),
        estado: 'WAIT'
      },
      update: {
        $set: {
          estado: "CHECK"
        }
      },
      new: true
    }, (err, invitacion) => {
      // If there aren't any posts, then return.
      if (err || !invitacion) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", invitacion });
    });
})
app.post('/ws/like_post/', function (req, res) {
  //const id = mongojs.ObjectId(req.body.id_post)
  var posts = db.collection('likes_posts')
    .find({ id_post: req.body.id_post })
    .limit(10)
    .toArray((err, likes) => {
      // If there aren't any posts, then return.
      if (err) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", likes });
    });
})
app.post('/ws/codigos_generados_post/', function (req, res) {
  const id = mongojs.ObjectId(req.body.id_post)
  
  var posts = db.collection('invitaciones')
    .find({ id_post: id })
    //.limit(20)
    .toArray((err, invitaciones) => {
      // If there aren't any posts, then return.
      console.log(invitaciones)
      if (err) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", invitaciones });
    });
})
/**
 * Comentarios de un post
 */
app.post('/ws/comments', function (req, res) {
  var messages = db.collection('message')
    .find({ id_post: mongojs.ObjectId(req.body.id_post) })
    .sort({ createdAt: -1 })
    .skip(25 * (req.body.page - 1)).limit(25)
    .toArray((err, messages) => {
      //console.log(messages.length)
      // If there aren't any messages, then return.
      if (err) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", comments: messages });
    });

});
//Foto usuario upload
app.post('/ws/upload_photo_user', upload.single('picture'), function (req, res, next) {
  var inputs = req.body;
  const id = mongojs.ObjectId(inputs.id)
  db.collection('users').findAndModify({
    query: { _id: id },
    update: {
      $set: {
        photo_url: "https://s3-sa-east-1.amazonaws.com/gn8bucket/" + req.file.originalname
      }
    }
  }, function (err, user, lastErrorObject) {
    // the update is complete 
    //Buscar la imagen anterior y actualizarla
    db.collection('users').findOne({
      _id: id
    }, function (err, user) {
      if (err) res.json({ res: 'error', detail: err });
      return res.json({ res: 'ok', user: user });
    })

  })
})
//Sign up Empresa
app.post('/ws/signupEmpresa', upload.single('picture'), function (req, res, next) {
  var inputs = req.body
  var userData = {
    name: inputs.name,
    email: inputs.email,
    username: inputs.username,
    password: inputs.password,
    photo_url: 'https://s3-sa-east-1.amazonaws.com/gn8bucket/' + req.file.originalname,
    es_empresa: 'SI',
    direccion: inputs.direccion,
    telefono: inputs.telefono,
    likes: 0,
    createdAt: new Date(),
    updateAt: new Date()
  }
  db.collection('users').insert(userData, (err, user) => {
    if (err)
      return res.json({ res: 'error', detail: err });
    return res.json({ res: 'ok', user: user });
  })
})
app.post('/ws/recuperar_usuario/', function (req, res) {
  const id = mongojs.ObjectId(req.body.id_usuario)
  db.collection('users')
    .findOne({ _id: id }, function (err, user) {
      // If there aren't any posts, then return.
      if (err) return res.json({ res: "error", detail: err });
      res.json({ res: "ok", user });
    });
})

//Guardar Post
app.post('/ws/guardar_post/', function (req, res) {
  const post_guardado = {
    id_usuario: mongojs.ObjectId(req.body.id_usuario),
    id_post: mongojs.ObjectId(req.body.id_post),
    save: req.body.save,
    createdAt: new Date(),
    updateAt: new Date()
  }

  const campo = "saved." + req.body.id_usuario
  db.collection('posts_guardados').findAndModify({
    query: {
      id_usuario: mongojs.ObjectId(req.body.id_usuario),
      id_post: mongojs.ObjectId(req.body.id_post),
    },
    update: {
      $set: {
        id_usuario: mongojs.ObjectId(req.body.id_usuario),
        id_post: mongojs.ObjectId(req.body.id_post),
        save: req.body.save,
        createdAt: new Date(),
        updateAt: new Date()
      }
    },
    upsert: true
  }, (err, post_inserted) => {
    if (err) return res.json({ res: 'error', detail: err });
    db.collection('posts').update(
      { _id: mongojs.ObjectId(req.body.id_post) }, {
        $set: { [campo]: req.body.save },
      }, (err, post) => {
        // the update is complete 
        if (err) return res.json({ res: 'error', detail: err });
        return res.json({ res: 'ok', post: post_inserted });
      })
  })
})

app.post('/ws/signup/', function (req, res) {
  var inputs = req.body
  const user_data = {
    name: inputs.name,
    email: inputs.email,
    username: inputs.username,
    // TODO: But encrypt the password first
    password: inputs.password,
    photo_url: inputs.photo_url,
    es_empresa: inputs.es_empresa,
    direccion: inputs.direccion,
    telefono: inputs.telefono,
    likes: 0
  }
  db.collection('users').insert(user_data, function (err, user) {
    if (err)
      return res.json({ res: 'error', detail: err });
    return res.json({ res: 'ok', user: user });
  })
})

app.post('/ws/isuser', function (req, res) {
  var inputs = req.body

  db.collection('users').findOne(
    { email: inputs.email }, function (err, user) {
      if (err || user == null)
        return res.json({ res: 'error', detail: err });
      return res.json({ res: 'ok', user: user });
    })
})

app.post('/ws/signin', function (req, res) {
  db.collection('users').findOne(
    {
      email: req.body.email,
      password: req.body.password
    },
    function (err, user) {
      if (err || user == null)
        return res.json({ res: 'error', detail: err });
      return res.json({ res: 'ok', user: user });
    })
})

//Buscar latitudes y longitudes de las publicaciones como markers
app.post('/ws/get_lat_lon_posts', function (req, res) {
  var distance = 1000 / 6371;
  const lat = parseFloat(req.body.lat)
  const lng = parseFloat(req.body.lng)

  console.log(req.body)
  db.collection('posts').find({
    geo: {
      $geoWithin: {
        $centerSphere: [[lng, lat],
        100 / 3963.2]
      }
    }
  }, {
      _id: 1, nombre_post: 1, latitude: 1, longitude: 1, photo_post: 1, photo_url: 1
    }).toArray((err, markers) => {

      if (err)
        return res.json({ res: 'error', detail: err });
      return res.json({ res: 'ok', markers });
    })
})
app.post('/ws/post_get', function (req, res) {
  var inputs = req.body

  db.collection('posts').findOne(
    { _id: mongojs.ObjectId(inputs._id) }, function (err, post) {
      if (err || post == null)
        return res.json({ res: 'error', detail: err });
      return res.json({ res: 'ok', post });
    })
})

websocket.on('connection', (socket) => {
  socket.on('message', (message) => _sendAndSaveMessage(message, socket));
  socket.on('like_post_web', (like) => _guardarLikePostWeb(like, socket))
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
    id_post: mongojs.ObjectId(message.id_post),
    id_user: mongojs.ObjectId(message.id_user),
    createdAt: new Date(),
    updateAt: new Date()
  };

  db.collection('message').insert(messageData, (err, message) => {
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
  //const like = like
  const campo = "liked." + like.id_user
  db.collection('likes_posts')
    .find({ id_post: like.id_post, id_user: like.id_user })
    .toArray((err, liked) => {
      if (err) return res.json({ res: "error", detail: err });
      if (liked.length > 0) {
        //Update like user

        db.collection('likes_posts')
          .update({ id_post: like.id_post, id_user: like.id_user },
            { $set: { like: like.like } },
            function (err, res) {
              if (err) console.log(err)
              db.collection('posts').update(
                { _id: id },
                {
                  $set: { [campo]: like.like },
                  $inc: { likesCount: like.like ? 1 : -1 }
                }, function (err, res) {
                  // the update is complete 
                  if (err) console.log(err)
                  // If the message is from the server, then send to everyone.
                  websocket.emit('like_post', like);
                })
            })
      } else {
        //Insert new like
        db.collection('likes_posts').insert(like, (err, liked) => {
          db.collection('posts').update(
            { _id: id }, {
              $set: { [campo]: like.like },
              $inc: { likesCount: 1 }
            }, function (err, post) {
              // the update is complete 
              if (err) return console.log(err)
              websocket.emit('like_post', like);
            })
        });
      }
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


//--------- home --------------------
app.get('/', function (req, res) {
  db.collection('posts')
    .find()
    .sort({ likesCount: -1 })
    .limit(10)
    .toArray((err, posts) => {
      res.render('index.ejs',{publicaciones:posts});
    });
  //res.render('index.ejs');
});

app.post('/login', function(req, res) { 
  var inputs = req.body;
  db.collection('users').findOne({
      username:inputs.usuario,
      password:inputs.password 
  }, function (err, user) {
      if (user==null) return res.redirect('/');
      if (user.length==0) return res.redirect('/');
        req.session.authenticated = true;
        req.session.user = user.username;
        req.session.name = user.name;
        req.session._id = user._id; 
        req.session.photo = user.photo_url;
        req.session.flag = user.es_empresa;
        if (user.photo_url=="") {
          req.session.photo="/assets/img/profile.jpg";
        }
        return res.redirect('/home');
  });
});

app.get('/logout', function(req, res) {
  delete req.session.authenticated;
  res.redirect('/');
});

app.get('/invitaciones', function (req, res) { 
  if (!req.session || !req.session.authenticated) {
    res.redirect('/');
  }else{

      db.collection('invitaciones')
        .find({ id_usuario_invitado: mongojs.ObjectId(req.session._id)})
        .toArray(function(err,invit){
            res.render('qr.ejs', {
              usuario : req.session.user,
              nombre : req.session.name,
              id : req.session._id,
              imagen : req.session.photo,
              tipo : req.session.flag,
              invitaciones : invit
            }); 
        }); 
  }
});

app.get('/home', function(req, res) {

  if (!req.session || !req.session.authenticated) {
    res.redirect('/');
  }else{
 
    var posts = db.collection('posts')
      .find()
      .skip(10 * (req.body.page - 1)).limit(10)
      .sort({ createdAt: -1 })
      .toArray((err, posts) => { 
          db.collection('invitaciones')
            .find({ id_usuario_invitado: mongojs.ObjectId(req.session._id),estado: "WAIT" })
            .count(function(err,countw){

              db.collection('invitaciones')
                .find({ id_usuario_invitado: mongojs.ObjectId(req.session._id),estado: "CHECK" })
                .count(function(err,countc){

                    db.collection('posts_guardados')
                      .find({ id_usuario: mongojs.ObjectId(req.session._id) })
                      .toArray((err, posts_saved) => {

                          res.render('home.ejs', {
                            usuario : req.session.user,
                            nombre : req.session.name,
                            id : req.session._id,
                            imagen : req.session.photo,
                            tipo : req.session.flag,
                            publicaciones : posts,
                            publicaciones_guardadas : posts_saved, 
                            invitacionesPendientes : countw,
                            invitacionesUsadas : countc
                          });
                        
                      });

                }); 

            }); 
      });
  }
});


app.post('/registrarUsuario', function (req, res) {
  var inputs = req.body 
  var userData = {
    name: inputs.nombreR,
    email: inputs.emailR,
    username: inputs.usuarioR,
    password: inputs.passwordR,
    photo_url: "",
    es_empresa: inputs.chbEmpresa == 'on' ? 'SI' : 'NO',
    direccion: "",
    telefono: "",
    likes: 0,
    createdAt: new Date(),
    updateAt: new Date()
  }
  db.collection('users').insert(userData, (err, user) => { 
    if (user.length==0) return res.redirect('/');
      req.session.authenticated = true;
      req.session.user = user.username;
      req.session.name = user.name;
      req.session._id = user._id;
      req.session.photo = user.photo_url;
      req.session.flag = user.es_empresa;
      if (user.photo_url=="") {
        req.session.photo="/assets/img/profile.png";
      }
      return res.redirect('/home');
  })
})


app.post('/crearEvento', function (req, res, next) {
  var inputs = req.body;
  console.log(req.body);
  var photo_post = 'https://s3-sa-east-1.amazonaws.com/gn8bucket/'// + req.file.originalname;
  var post = {
    nombre_post: inputs.nombre_post,
    photo_post: photo_post,
    descripcion: inputs.descripcion_post,
    id_usuario: mongojs.ObjectId(inputs.id_usuario),
    nombre_usuario: inputs.nombre_usuario,
    photo_url: "",//inputs.photo_url,
    likesCount: 0,
    liked: {},
    commentsCount: 0,
    codigoqr: inputs.codigoqr == 'on' ? true : false,
    codigoqr_des: inputs.codigoqr_des,
    latitude: inputs.lat,
    longitude: inputs.lng,
    categorias: "",
    createdAt: new Date(),
    updateAt: new Date()
  }

  db.collection('posts').insert(post, (err, post) => {
    if (post.length==0) return res.redirect('/');

    return res.redirect('/home'); 
  });
});
 

app.post('/generarCodigoQR', function (req, res) { 
  var inputs = req.body 
  var invitacionQR = {
    id_post: mongojs.ObjectId(inputs.id_post),
    id_usuario_invitado: mongojs.ObjectId(inputs.id_usuario_invitado),
    nombre_post: inputs.nombre_post,
    photo_post: inputs.photo_post,
    codigoqr_des: inputs.codigoqr_des,
    id_usuario: mongojs.ObjectId(inputs.id_usuario),
    nombre_usuario: inputs.nombre_usuario,
    photo_url: inputs.photo_url,
    estado: "WAIT",
    createdAt: new Date(),
    updateAt: new Date()
  }

  db.collection('invitaciones')
    .find({ id_post: mongojs.ObjectId(inputs.id_post), id_usuario_invitado: mongojs.ObjectId(inputs.id_usuario_invitado) })
    .toArray((err, invitacion) => {
        console.log(invitacion);
       if (invitacion.length <= 0) {
          db.collection('invitaciones').insert(invitacionQR, (err, inv) => {
            if (err) return res.json({ res: "error", detail: err })
            return res.json({ res: "ok", inv })
          });
       }else{
          return res.json({ res: "update", detail: err })
       }
    }); 

});


app.post('/guardarPublicacion', function (req, res) {
  const post_guardado = {
    id_usuario: mongojs.ObjectId(req.body.id_usuario),
    id_post: mongojs.ObjectId(req.body.id_post),
    photo_post: req.body.photo_post,
    nombre_post: req.body.nombre_post,
    nombre_usuario : req.body.nombre_usuario,
    save: req.body.save,
    createdAt: new Date(),
    updateAt: new Date()
  }

    db.collection('posts_guardados')
      .find({ id_usuario: mongojs.ObjectId(req.body.id_usuario), id_post: mongojs.ObjectId(req.body.id_post) })
      .toArray((err, posts) => {
        if (posts.length > 0) {
            
            db.collection('posts_guardados').findAndModify({
              query: {
                id_usuario: mongojs.ObjectId(req.body.id_usuario),
                id_post: mongojs.ObjectId(req.body.id_post),
              },
              update: {
                $set: {
                  id_usuario: mongojs.ObjectId(req.body.id_usuario),
                  id_post: mongojs.ObjectId(req.body.id_post),
                  save: req.body.save,
                  createdAt: new Date(),
                  updateAt: new Date()
                }
              },
              upsert: true
            }, (err, post_inserted) => {
              if (err) return res.json({ res: 'error', detail: err }); 
              return res.json({ res: 'update', post: post_inserted });
            });

        }else{
            db.collection('posts_guardados').insert(post_guardado, (err, posts) => { 
              if (err) return res.json({ res: "error", detail: err })
              return res.json({ res: "ok", posts })
            });
        }
      }); 
})


function _guardarLikePostWeb(like, socket) {
  const id = mongojs.ObjectId(like.id_post)
  //const like = like
  const campo = "liked." + like.id_user
  db.collection('likes_posts')
    .find({ id_post: like.id_post, id_user: like.id_user })
    .toArray((err, liked) => {
      if (liked.length > 0) {
        //Update like user

        db.collection('likes_posts')
          .update({ id_post: like.id_post, id_user: like.id_user },
          { $set: { like: like.like } },
          function (err, res) {
            if (err) console.log(err)
            db.collection('posts').update(
              { _id: id },
              {
                $set: { [campo]: like.like },
                $inc: { likesCount: like.like==1 ? 1 : -1 }
              }, function (err, res) {
                // the update is complete 
                if (err) console.log(err)
                // If the message is from the server, then send to everyone.

                db.collection('posts').findOne({
                    _id: id
                }, function (err, posts) {
                    websocket.emit('like_post', {'like':like,'post':posts});
                });
              });
          })
      } else {
        //Insert new like
        db.collection('likes_posts').insert(like, (err, liked) => {
          db.collection('posts').update(
            { _id: id }, {
              $set: { [campo]: like.like },
              $inc: { likesCount: 1 }
            }, function (err, post) {
              // the update is complete 
              if (err) return console.log(err)

               db.collection('posts').findOne({
                    _id: id
                }, function (err, posts) {
                    websocket.emit('like_post', {'like':like,'post':posts});
                });
            })
        });
      }
    });
}

