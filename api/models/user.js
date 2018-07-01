var mongoose     = require('mongoose');
var Schema       = mongoose.Schema;
var bcrypt 		 = require('bcrypt-nodejs');

var UserSchema   = new Schema({
    name: { type: String, required: true },
    username: { type: String, required: true, index: { unique: true }},
    password: { type: String, required: true },
    email: { type: String, required: true, index: { unique: true }},
    bday: { type: String, required: true },
    imageLink: { type: String, required: false },
    imageHashDelete: { type: String, required: false },
    tokenToConfirmEmail: { type: String },
    tokenToResetPassword: { type: String },
    friends: {type: Array, default: []}
});

// Хеширование пароля перед добавлением в БД
UserSchema.pre('save', function(next) {
    var user = this;
    if (!user.isModified('password')) return next();
    bcrypt.hash(user.password, null, null, function(err, hash) {
        if (err) return next(err);
        user.password = hash;
        next();
    });
});

UserSchema.methods.comparePassword = function(password) {
    var user = this;
    return bcrypt.compareSync(password, user.password);
};

module.exports = mongoose.model('User', UserSchema);