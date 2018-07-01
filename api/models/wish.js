var mongoose     = require('mongoose');
var Schema       = mongoose.Schema,
    ObjectId = Schema.ObjectId;

var WishSchema = new Schema({
	title: { type: String, required: true },
	createdDate: { type: String, required: true},
    content: { type: String, required: false},
    link: { type: String, required: false},
    isReceived: { type: Boolean, required: true, default: false },
    imageLink: { type: String, required: false },
    imageHashDelete: { type: String, required: false },
    userId: { type: ObjectId, required: true },
    username: { type: String, required: true },
    reserved: { type: String, required: true, default: "false" }
});

module.exports = mongoose.model('Wish', WishSchema);