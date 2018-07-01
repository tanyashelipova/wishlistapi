var mongoose     = require('mongoose');
var Schema       = mongoose.Schema,
ObjectId = Schema.ObjectId;

var CommentSchema = new Schema({
	text: { type: String, required: true },
	date: { type: String, required: true },
	username: { type: String, required: true },
        userId: { type: ObjectId, required: true },
        wishId: { type: ObjectId, required: true },
        wishOwnerId: { type: ObjectId, required: true }
});

module.exports = mongoose.model('Comment', CommentSchema);