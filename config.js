module.exports = {
	'port': process.env.PORT || 3000,
//	'database': 'localhost:27017/wishlist',
	'database': process.env.MONGOLAB_URI,
    'secret': 'mysecret'
};