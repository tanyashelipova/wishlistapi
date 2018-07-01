var Wish = require('../models/wish');
var User = require('../models/user');
var Comment = require('../models/comment');
var jwt = require('jsonwebtoken');
var http = require('http');
var config = require('../../config');
var ObjectId = require('mongoose').Types.ObjectId;
var nodemailer = require('nodemailer');

var superSecret = config.secret;

module.exports = function(app, express) {

    var apiRouter = express.Router();

    // Авторизация
    apiRouter.post('/authenticate', function(req, res) {
        var search;
        if (req.body.usernameOrEmail.includes('@')) {
            search = User.findOne({
                email: req.body.usernameOrEmail
            });
        } else {
            search = User.findOne({
                username: req.body.usernameOrEmail
            });
        }
        search.select('_id username password name bday email friends imageLink imageHashDelete').exec(function(err, user) {

            if (err) {
                return res.status(500).send({
                    success: false,
                    message: err
                });
            }

            if (!user) {
                res.json({
                    success: false,
                    message: 'Данный пользователь не найден'
                });
            } else if (user) {

                // Верен ли пароль
                var validPassword = user.comparePassword(req.body.password);
                if (!validPassword) {
                    res.json({
                        success: false,
                        message: 'Неверный пароль'
                    });
                } else {

                    // Если да, создаем токен
                    var token = jwt.sign({
                        userId: user._id,
                        username: user.username
                    }, superSecret, {
                        expiresInMinutes: 55000000
                    });

                    // Возвращаем информацию о пользователе в виде JSON
                    res.json({
                        success: true,

                        name: user.name,
                        bday: user.bday,
                        email: user.email,
                        username: user.username,
                        friends: user.friends,

                        imageLink: user.imageLink,
                        imageHashDelete: user.imageHashDelete,

                        userId: user._id,
                        token: token
                    });
                }
            }
        });
    });

    apiRouter.route('/register')
        // Регистрация
        .post(function(req, res) {
            if (req.body.password != req.body.password2) {
                return res.json({
                    success: false,
                    message: 'Пароли не совпадают'
                });
            }
            var user = new User();
            user.username = req.body.username;
            user.password = req.body.password;
            user.name = req.body.name;
            user.email = req.body.email;
            user.bday = req.body.bday;

            user.imageLink = req.body.imageLink;
            user.imageHashDelete = req.body.imageHashDelete;

            if (JSON.stringify(req.userAgent) != '{}') {
                user.userAgent = req.userAgent;
            }

            user.save(function(err) {
                if (err) {
                    if (err.code == 11000) {
                        if (err.message.includes('email')) {
                            return res.send({
                                success: false,
                                message: "Пользователь с данным e-mail уже существует"
                            });
                        }
                        if (err.message.includes('username')) {
                            return res.send({
                                success: false,
                                message: "Данное имя пользователя занято"
                            });
                        }
                    }
                    return res.status(500).send({
                        success: false,
                        message: err
                    });
                }

                var token = jwt.sign({
                    userId: user._id,
                    username: user.username
                }, superSecret, {
                    expiresInMinutes: 55000000
                });

                res.json({
                    success: true,
                    message: 'Регистрация прошла успешно',

                    name: user.name,
                    bday: user.bday,
                    email: user.email,

                    imageLink: user.imageLink,
                    imageHashDelete: user.imageHashDelete,

                    userId: user._id,
                    token: token
                });
            });

        });

    // Отправка письма
    apiRouter.post('/send_mail_to_confirm', function(req, res) {
        User.findOne({
            username: req.body.username
        }).select('_id username tokenToConfirmEmail email').exec(function(err, user) {
            var token = '';
            if (err) {
                return res.status(500).send({
                    success: false,
                    message: err
                });
            }
            if (!user) {
                res.json({
                    success: false,
                    message: 'Данный пользователь не найден'
                });
            } else if (user) {
                // Адрес был подтвержден, адрес не меняется
                if (user.tokenToConfirmEmail == "confirmed" && req.body.email == user.email) {
                    res.json({
                        success: false,
                        message: "Почта уже подтверждена"
                    });
                    return;
                }
                // Письмо отправляется только что созданному пользователю или пользователю,
                // изменившему адрес электронной почты.
                if (user.tokenToConfirmEmail == null || req.body.email != user.emai) {
                    token = jwt.sign({
                        userId: user._id,
                        username: user.username
                    }, superSecret, {
                        expiresInMinutes: 55000000
                    });
                    user.tokenToConfirmEmail = token;
                    user.save();
                }
                var subject = 'Подтверждение адреса электронной почты. Wish List / Список желаний';
                var text = 'Спасибо за регистрацию в приложении Wish List!' + '\n' + 'Подтвердите данный адрес электронной почты, ' +
                    'перейдя по ссылке ниже. Без подтверждения Вы не сможете восстановить пароль при необходимости. ' + '\n' +
                    'https://wishlist2018.herokuapp.com/api/confirmemail/' + token + '\n' +
                    'Отличного дня! :)';
                var message1 = "Не удалось отправить письмо на почту " + req.body.email +
                    ". Проверьте корректность адреса.";
                var message2 = "Письмо отправлено на почту " + req.body.email +
                    ". Подтвердите адрес, иначе при необходимости восстановить пароль будет невозможно.";
                sendMail(req.body.email, subject, text, res, message1, message2);
            }
        });
    });

    apiRouter.route('/confirmemail/:token')
        .get(function(req, res) {
            // Если данный токен найден в базе данных, то почта подтверждена успешно.
            User.findOne({
                tokenToConfirmEmail: req.params.token
            }, function(err, user) {
                if (!user) {
                    res.write('<html><head> <meta charset="UTF-8"> ' +
                        '<title>Wish List</title> </head><body>');
                    res.write('<h1> Неверная или не действующая ссылка </h1>');
                    res.end('</body></html>');
                } else {
                    user.tokenToConfirmEmail = 'confirmed';
                    user.save();
                    res.write('<html><head> <meta charset="UTF-8">' +
                        '<title>Wish List</title> </head><body>');
                    res.write('<h1> Почта подтверждена! </h1>');
                    res.end('</body></html>');

                }
            });
        });

    apiRouter.route('/resetpassword/:token')
        .get(function(req, res) {
            User.findOne({
                tokenToResetPassword: req.params.token
            }, function(err, user) {
                if (!user) {
                    res.write('<html><head> <meta charset="UTF-8"> ' +
                        '<title>Wish List</title> </head><body>');
                    res.write('<h1> Неверная или не действующая ссылка </h1>');
                    res.end('</body></html>');
                } else {
                    user.tokenToResetPassword = "reset";
                    user.save();
                    res.write('<html><head> <meta charset="UTF-8">' +
                        '<title>Wish List</title> </head><body>');
                    res.write('<h1> Пароль сброшен. Установите новый пароль в приложении. </h1>');
                    res.end('</body></html>');

                }
            });
        });

    apiRouter.route('/resetpassword')
        .post(function(req, res) {
            if (req.body.email) {
                User.findOne({
                        email: req.body.email
                    })
                    .select('_id username tokenToConfirmEmail email tokenToResetPassword').exec(function(err, user) {
                        if (!user) {
                            res.json({
                                success: false,
                                message: 'Пользователь с данным адресом почты не найден'
                            });
                        } else {
                            if (user.tokenToConfirmEmail != 'confirmed') {
                                res.json({
                                    success: false,
                                    message: 'Данный адрес почты не был подтвержден'
                                });
                            } else {
                                createToken(user);
                            }
                        }
                    });
            }

            if (req.body.username) {
                User.findOne({
                        username: req.body.username
                    })
                    .select('_id username tokenToConfirmEmail email tokenToResetPassword').exec(function(err, user) {
                        if (!user) {
                            res.json({
                                success: false,
                                message: 'Пользователь с данным именем не найден'
                            });
                        } else {
                            if (user.tokenToConfirmEmail != 'confirmed') {
                                res.json({
                                    success: false,
                                    message: 'Адрес почты, указанный при регистрации данного пользователя' +
                                        ' не был подтвержден'
                                });
                            } else {
                                createToken(user);
                            }
                        }
                    });
            }

            function createToken(user) {
                var token = jwt.sign({
                    userId: user._id,
                    username: user.username
                }, superSecret, {
                    expiresInMinutes: 15
                });
                user.tokenToResetPassword = token;
                user.save();
                var subject = 'Восстановление пароля. Wish List / Список желаний'
                var text = 'Для восстановления пароля перейдите по ссылке ниже.' + '\n' +
                    'https://wishlist2018.herokuapp.com/api/resetpassword/' + token + '\n' +
                    'Ссылка действительна в течение 15 минут.' + '\n' +
                    'Отличного дня! :)'
                var message1 = "Не удалось отправить письмо на " + user.email;
                var message2 = "Письмо отправлено на " + user.mail;
                sendMail(user.email, subject, text, res, message1, message2);
            }
        });


    apiRouter.route('/restore')
        .post(function(req, res) {
            if (req.body.username) {
                User.findOne({
                    username: req.body.username
                }, function(err, user) {
                    if (!user) {
                        res.json({
                            success: false,
                            message: "Пользователь не найден"
                        })
                    } else {
                        if (user.tokenToResetPassword == 'reset') {
                            user.password = req.body.password;
                            user.save();
                            res.json({
                                success: false,
                                message: 'Пароль успешно изменен.'
                            });
                        } else {
                            res.json({
                                success: false,
                                message: 'Пароль не был сброшен. Проверьте почту.'
                            });
                        }
                    }
                });
            }

            if (req.body.email) {
                User.findOne({
                    email: req.body.email
                }, function(err, user) {
                    if (!user) {
                        res.json({
                            success: false,
                            message: "Пользователь не найден"
                        })
                    } else {
                        if (user.tokenToResetPassword == 'reset') {
                            user.password = req.body.password;
                            user.save();
                            res.json({
                                success: false,
                                message: 'Пароль изменен!'
                            });
                        } else {
                            res.json({
                                success: false,
                                message: 'Пароль не был сброшен. Проверьте почту.'
                            });
                        }

                    }
                });
            }
        });

    apiRouter.route('/wishes/')
        // Получить желания пользователя по его ID
        .get(function(req, res) {
            if (req.query.userId) {
                var userId = new ObjectId(req.query.userId);
                Wish.find({
                    userId: userId
                }).sort({
                    _id: -1
                }).exec(function(err, wishes) {
                    if (err) {
                        return res.status(500).send({
                            success: false,
                            message: err
                        });
                    }
                    res.json({
                        success: true,
                        wishes: wishes
                    });
                });
            }
        })
        // Добавить желание
        .post(function(req, res) {
            var d = new Date();
            var date = getDateFunction(d);
            //var date = ('0' + d.getDate()) + '/' + ('0' + (d.getMonth() + 1)) + '/' + d.getFullYear();

            var wish = new Wish();
            wish.content = req.body.content;
            wish.title = req.body.title;
            wish.isReceived = req.body.isReceived;
            wish.link = req.body.link;

            wish.imageLink = req.body.imageLink;
            wish.imageHashDelete = req.body.imageHashDelete;

            wish.createdDate = date;
            var userId = new ObjectId(req.body.userId);
            wish.userId = userId;
            wish.username = req.body.username;
            wish.reserved = "false";

            wish.save(function(err, result) {
                if (err) {
                    return res.status(500).send({
                        success: false,
                        message: err
                    });
                }
                res.json({
                    success: true,
                    message: 'Желание создано!',
                    wish: result
                });
            });
        })

        // Удаление всех желаний, добавленных пользователем с заданным ID
        .delete(function(req, res) {
            var userId = new ObjectId(req.query.userId);
            Wish.remove({
                userId: userId
            }, function(err, wishes) {
                if (err) {
                    return res.status(500).send({
                        success: false,
                        message: err
                    });
                }
                Comment.remove({
                    wishOwnerId: userId
                }, function(err, comment) {});
                res.json({
                    success: true,
                    message: 'Все желания удалены'
                });
            });
        })

        .put(function(req, res) {
            if (req.body._id) {
                Wish.findById(req.body._id, function(err, wish) {
                    if (err) {
                        return res.status(500).send({
                            success: false,
                            message: err
                        });
                    }
                    if (wish == null) {
                        return res.send({
                            success: false,
                            message: "ID некорректен",
                            wish: wish
                        });
                    }
                    wish.title = req.body.title;
                    wish.isReceived = req.body.isReceived;
                    wish.content = req.body.content;
                    wish.link = req.body.link;
                    wish.imageLink = req.body.imageLink;
                    wish.imageHashDelete = req.body.imageHashDelete;
                    wish.save(function(err) {
                        if (err) {
                            return res.send({
                                success: false,
                                message: err
                            });
                        }
                        res.json({
                            success: true,
                            message: 'Желание обновлено!',
                            wish: wish
                        });
                    });
                });

            } else {
                res.json({
                    success: false,
                    message: 'Неверные параметры в запросе',
                    wish: null
                });
            }
        });


    apiRouter.route('/wishes/:wishId')
        .get(function(req, res) {
            // Получить wish подарок by id
            Wish.findById(req.params.wishId, function(err, wish) {
                if (err) {
                    return res.status(500).send({
                        success: false,
                        message: err
                    });
                }
                res.json({
                    success: true,
                    message: 'Пожалуйста, вот ваше желание',
                    wish: wish
                });
            });
        })
        // Удалить желание по его ID
        .delete(function(req, res) {
            Wish.remove({
                _id: req.params.wishId
            }, function(err, wish) {
                if (err) {
                    return res.status(500).send({
                        success: false,
                        message: err
                    });
                }
                deleteAllComments(req.params.wishId);
                res.json({
                    success: true,
                    message: 'Желание удалено'
                });
            });
        });

    apiRouter.route('/users')
        // Получение информации о пользователе
        .get(function(req, res) {
            // Получить список друзей
            if (req.query.friends && req.query.username) {
                // Получаем список usernames друзей
                User.findOne({
                    username: req.query.username
                }).select('friends').exec(function(err, user) {
                    if (err) {
                        return res.status(500).send({
                            success: false,
                            message: err
                        });
                    }
                    if (user != null) {
                        var friends = user.friends;
                        User.find({
                            username: {
                                $in: user.friends
                            }
                        }).select('username name bday imageLink').exec(function(err, users) {
                            if (err) {
                                return res.status(500).send({
                                    success: false,
                                    message: err
                                });
                            }
                            if (users != null) {
                                res.json({
                                    success: true,
                                    friends: users
                                });
                            }
                        });
                    } else {
                        res.json({
                            success: false
                        })
                    }
                });
                return;
            }

            // Получить пользователя по имени пользователя
            if (req.query.username) {
                User.findOne({
                    username: req.query.username
                }).select('_id username name bday email friends imageLink').exec(function(err, user) {
                    if (err) {
                        return res.status(500).send({
                            success: false,
                            message: err
                        });
                    }
                    if (user != null) {
                        res.json({
                            success: true,
                            name: user.name,
                            bday: user.bday,
                            email: user.email,
                            userId: user._id,
                            imageLink: user.imageLink,
                            friends: user.friends
                        })
                    } else {
                        res.json({
                            success: false
                        })
                    }
                });
                return;
            }
        })
        // Редактирование информации о пользователе
        .put(function(req, res) {
            // Добавить друга
            if (req.query.action == 'addFriend') {
                User.findById(req.body.userId, function(err, user) {
                    if (err) {
                        return res.status(500).send({
                            success: false,
                            message: err
                        });
                    }
                    if (!user || user == null) {
                        res.json({
                            success: false,
                            message: 'Пользователь не найден'
                        });
                    }
                    if (user.username == req.body.friendUsername) {
                        res.json({
                            success: false,
                            message: 'Нельзя добавить себя же в друзья'
                        });
                    }
                    if (req.body.friendUsername) {
                        var index = user.friends.indexOf(req.body.friendUsername);
                        if (index == -1) {
                            user.friends.push(req.body.friendUsername);
                        } else {
                            res.json({
                                success: false,
                                message: 'Пользователь уже в вашем списке друзей'
                            });
                            return;
                        }
                    }
                    user.save(function(err) {
                        if (err) {
                            return res.json({
                                success: false,
                                message: err
                            });
                        }
                        res.json({
                            success: true,
                            message: 'Друг добавлен'
                        });
                    });
                });
                return;
            }

            // Удалить друга
            if (req.query.action == 'removeFriend') {
                User.findById(req.body.userId, function(err, user) {
                    if (err) {
                        return res.status(500).send({
                            success: false,
                            message: err
                        });
                    }
                    if (!user || user == null) {
                        res.json({
                            success: false,
                            message: 'Пользователь не найден'
                        });
                    }
                    if (user.username == req.body.friendUsername) {
                        res.json({
                            success: false,
                            message: 'Нельзя удалить себя из друзей'
                        });
                    }
                    if (req.body.friendUsername != null) {
                        var index = user.friends.indexOf(req.body.friendUsername);
                        if (index > -1) {
                            user.friends.splice(index, 1);
                        } else {
                            res.json({
                                success: false,
                                message: 'Данный пользователь не найден в списке друзей'
                            });
                            return;
                        }
                    }
                    user.save(function(err) {
                        if (err) {
                            return res.json({
                                success: false,
                                message: err
                            });
                        }
                        res.json({
                            success: true,
                            message: 'Друг удален'
                        });
                    });

                });
                return;
            }

            // Изменить данные о пользователе
            if (req.query.action == 'changeData') {
                var oldUsername;
                User.findById(req.body.userId, function(err, user) {
                    if (err) {
                        return res.status(500).send({
                            success: false,
                            message: err
                        });
                    }
                    if (!user || user == null) {
                        res.json({
                            success: false,
                            message: 'Пользователь не найден'
                        });
                    }
                    if (req.body.username != null) {
                        oldUsername = user.username;
                        user.username = req.body.username;
                    }

                    if (req.body.name != null) {
                        user.name = req.body.name;
                    }
                    if (req.body.email != null) {
                        user.email = req.body.email;
                        user.tokenToConfirmEmail = null;
                    }
                    if (req.body.bday != null) {
                        user.bday = req.body.bday;
                    }
                    if (req.body.password != null) {
                        user.password = req.body.password;
                    }
                    user.imageLink = req.body.imageLink;
                    user.imageHashDelete = req.body.imageHashDelete;
                    user.save(function(err) {
                        if (err) {
                            if (err.code == 11000) {
                                if (err.message.includes('email')) {
                                    return res.send({
                                        success: false,
                                        message: "Пользователь с данным e-mail уже существует"
                                    });
                                }
                                if (err.message.includes('username')) {
                                    return res.send({
                                        success: false,
                                        message: "Данное имя пользователя занято"
                                    });
                                }
                            }
                            return res.status(500).send({
                                success: false,
                                message: err
                            });
                        }
                        if (oldUsername != null) {
                            console.log(oldUsername);
                            changeUsername(oldUsername, req.body.username);
                        }
                        res.json({
                            success: true,
                            message: 'Данные сохранены!'
                        });
                    });

                });
            }
        })
        // Удаление пользователя
        .delete(function(req, res) {
            var userId = new ObjectId(req.query.userId); 
                User.remove({
                    _id: userId
                }, function(err, user) {
                    email = user.email;
                    if (err) {
                        return res.status(500).send({
                            success: false,
                            message: err
                        });
                    }
                    deleteCommentsByUser(userId);  
                    subject = "Профиль удален. Wish List / Список желаний";
                    text = "Ваш профиль был удален из приложения Wish List. Спасибо, что были с нами!";
                    message1 = "Профиль удален";
                    sendMail(req.query.email, subject, text, res, message1, message1);
                });
            });


    apiRouter.route('/friends_wishes/:friends_usernames')
        // подарки друзей
        .get(function(req, res) {
            var friendsUsernames = req.params.friends_usernames;
            friendsUsernames = friendsUsernames.split(",");
            Wish.find({
                username: {
                    $in: friendsUsernames
                }
            }).sort({
                _id: -1
            }).exec(function(err, wishes) {
                if (err) {
                    return res.status(500).send({
                        success: false,
                        message: err
                    });
                }
                res.json({
                    success: true,
                    wishes: wishes
                });
            });
        });

    apiRouter.route('/friends_wishes/')
        // Лента пуста
        .get(function(req, res) {
            res.json({
                success: false,
                wishes: null
            });
        });


    function sendMail(email, subject, text, res, message1, message2) {
        var transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'wishlistapp2018@gmail.com',
                pass: '*********'
            }
        });
        var mailOptions = {
            from: 'wishlistapp2018@gmail.com',
            to: email,
            subject: subject,
            text: text
        };
        transporter.sendMail(mailOptions, function(error, info) {
            if (error) {
                res.json({
                    success: false,
                    message: message1
                })
            } else {
                res.json({
                    success: true,
                    message: message2
                })
            }
        });
    }

    // Комментарии
    apiRouter.route('/comments/')
        .post(function(req, res) {
            var wishId = new ObjectId(req.body.wishId);
            Wish.findOne({
                _id: wishId
            }, function(err, wish) {
                if (err) {
                    return res.status(500).send({
                        success: false,
                        message: err
                    });
                }
                if (!wish) {
                    res.json({
                        success: false,
                        message: "Данное желание не найдено"
                    })
                } else {
                    var d = new Date();
                    var date = getDateFunction(d);
                    //var date = ('0' + d.getDate()) + '/' + ('0' + (d.getMonth() + 1)) + '/' + d.getFullYear();

                    var comment = new Comment();
                    comment.text = req.body.text;
                    comment.userId = req.body.userId;
                    comment.wishId = req.body.wishId;
                    comment.wishOwnerId = wish.userId;
                    comment.username = req.body.username;
                    comment.date = date;

                    comment.save(function(err, result) {
                        if (err) {
                            return res.status(500).send({
                                success: false,
                                message: err
                            });
                        }
                        res.json({
                            success: true,
                            message: 'Комментарий добавлен'
                        });
                    });
                }
            });
        })

        .get(function(req, res) {
            var wishId = new ObjectId(req.query.wishId);
            Comment.find({
                wishId: wishId
            }).exec(function(err, comments) {
                if (err) {
                    return res.status(500).send({
                        success: false,
                        message: err
                    });
                }
                if (comments == null) {
                    res.json({
                        success: true,
                        message: "Комментариев нет",
                        comments: null
                    });
                } else {
                    res.json({
                        success: true,
                        message: "Комментарии",
                        comments: comments
                    });
                }
            });
        })

        .delete(function(req, res) {
            var commentId = new ObjectId(req.query.commentId);
            Comment.findOne({
                _id: commentId
            }, function(err, comment) {
                if (err) {
                    return res.status(500).send({
                        success: false,
                        message: err
                    });
                }
                if (!comment) {
                    res.json({
                        success: false,
                        message: "Комментарий не найден"
                    })
                } else {
                    // Если это комментарий не пользователя , либо это комментарий под не его желанием
                    if (comment.userId == req.query.userId || comment.wishOwnerId == req.query.userId) {
                                            Comment.remove({
                                                _id: req.query.commentId
                                            }, function(err, comment) {
                                                if (err) {
                                                    return res.status(500).send({
                                                        success: false,
                                                        message: err
                                                    });
                                                }
                                                res.json({
                                                    success: true,
                                                    message: 'Комментарий удален'
                                                });
                                            });
                    } else {
                                                res.json({
                                                    success: false,
                                                    message: "Вы не можете удалить чужой комментарий"
                                                });
                    }
                }
            });
        });

    function deleteAllComments(wishId) {
        Comment.remove({
            wishId: wishId
        }, function(err, comment) {
            if (err) {
                return false;
            }
            return true;
        });
    }

    function deleteCommentsByUser(userId) {
        Comment.remove({
            userId: userId
        }, function(err, comments) {
            if (err) {
                return false;
            }
            return true;
        });
    }

    // Поиск пользователей в т.ч. по части имени пользователя
    apiRouter.route('/search/')
        .get(function(req, res) {
            User.find({
                username: { $regex : ".*"+ req.query.username +".*", $options:'i' } 
            }).select('_id username name').exec(function(err, users) {
                if (err) {
                    return res.status(500).send({
                        success: false,
                        message: err
                    });
                }
                if (users != null) {
                    res.json({
                        success: true,
                        message: "Найденные пользователи",
                        users: users
                    })
                } else {
                    res.json({
                        success: false,
                        message: "Пользователь не найден",
                        users: null
                    })
                }
            });
    });

    function getDateFunction(d) {
        var day, month;
        if (d.getDate() > 9) {
            day = d.getDate();
        } else {
            day = '0' + d.getDate();
        }

        if (d.getMonth() + 1 > 9) {
            month = d.getMonth() + 1;
        } else {
            month = '0' + (d.getMonth() + 1);
        }
        var date = day + '/' + month + '/' + d.getFullYear();
        return date;
    }

    function changeUsername(usernameOld, usernameNew) {
        console.log(usernameNew);
        Wish.find({
            username: usernameOld
        }).exec(function(err, wishes) {
            if (err) {
                return res.status(500).send({
                    success: false,
                    message: err
                });
            }
            if (wishes != null) {
                console.log(wishes.length);
                for (var i = 0; i < wishes.length; i++){
                    console.log(wishes.length);
                    wishes[i].username = usernameNew;
                    wishes[i].save();
                }
            } 
        });

        Comment.find({
            username: usernameOld
        }).exec(function(err, comments) {
            if (err) {
                return res.status(500).send({
                    success: false,
                    message: err
                });
            }
            if (comments != null) {
                console.log(comments.length);
                for (var i = 0; i < comments.length; i++){
                    comments[i].username = usernameNew;
                    comments[i].save();
                }
            } 
        });
    }

    apiRouter.route('/reserve_wish/')  // id желания и пользователь, кот-й резервирует 
    .put(function(req, res) {
        if (req.body._id) {
            Wish.findById(req.body._id, function(err, wish) {
                if (err) {
                    return res.status(500).send({
                        success: false,
                        message: err
                    });
                }
                if (wish == null) {
                    return res.send({
                        success: false,
                        message: "ID некорректен"
                    });
                }
                wish.reserved = req.body.username;
                wish.save(function(err) {
                    if (err) {
                        return res.send({
                            success: false,
                            message: err
                        });
                    }
                    res.json({
                        success: true,
                        message: 'Данные обновлены'
                    });
                });
            });

        } else {
            res.json({
                success: false,
                message: 'Неверные параметры в запросе'
            });
        }
    });

    return apiRouter;
};