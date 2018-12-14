'use strict'

const ProviderEngine = require('web3-provider-engine')
const CacheSubprovider = require('web3-provider-engine/subproviders/cache.js')
const FixtureSubprovider = require('web3-provider-engine/subproviders/fixture.js')
const FilterSubprovider = require('web3-provider-engine/subproviders/filters.js')
const VmSubprovider = require('web3-provider-engine/subproviders/vm.js')
const HookedWalletSubprovider = require('web3-provider-engine/subproviders/hooked-wallet.js')
const NonceSubprovider = require('web3-provider-engine/subproviders/nonce-tracker.js')
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc.js')
const ethUtil = require('ethereumjs-util')
const sigUtil = require('eth-sig-util')

function concatSig(v, r, s) {
  r = ethUtil.fromSigned(r)
  s = ethUtil.fromSigned(s)
  v = ethUtil.bufferToInt(v)
  r = ethUtil.toUnsigned(r).toString('hex').padStart(64, 0)
  s = ethUtil.toUnsigned(s).toString('hex').padStart(64, 0)
  v = ethUtil.stripHexPrefix(ethUtil.intToHex(v))
  return ethUtil.addHexPrefix(r.concat(s, v).toString("hex"))
}

function constructMetaTransaction(txParams, signature, username) {
	return {
		"action":"sendTransaction",
		"signature": signature,
		"params":{
			"gasPrice": txParams.gasPrice,
			"gasLimit": txParams.gasLimit,
			"nonce": txParams.nonce,
			"to": txParams.to,
			"value": txParams.value,
			"data": txParams.data,
			"action": "sendTransaction"
			},
		"username": username
	};
}

function CreateTapTrustProvider(
	_approveTransaction, //function(txParams, callback(error, bool approved))
	_approveMessage, //function(msgParams, callback(error, bool approved))
	_approvePersonalMessage, //function(msgParams, callback(error, bool approved))
	_approveTypedMessage, //function(msgParams, callback(error, bool approved))
	_getNextNonce, //function(address, callback(error, nonce))
	_getPrivateKey, //function(address, callback(error, privateKey))
	_getUsername, //function(address, callback(error, username))
	_postTransaction //function(metaTxObject, callback(error, txHash)) 
	) {

	const _signMessage = function(msgParams, cb) { 
		_getPrivateKey(msgParams.from, function(err, privateKey) {
		  if (err) return cb(err)
		  var dataBuff = ethUtil.toBuffer(msgParams.data)
		  var msgHash = ethUtil.hashPersonalMessage(dataBuff)
		  var sig = ethUtil.ecsign(msgHash, privateKey)
		  var serialized = ethUtil.bufferToHex(concatSig(sig.v, sig.r, sig.s))
		  cb(null, serialized)
		})
	}
	
	const _signTransaction = function(txParams, cb) {
		_getNextNonce(txParams.from, function(err, nonce) {
			txParams.nonce = nonce;
			var hash = web3.utils.soliditySha3(
				{t:'uint256', v: txParams.nonce},
				{t:'uint256', v: txParams.gasPrice},
				{t:'uint256', v: txParams.gasLimit},
				{t:'address', v: txParams.to},
				{t:'uint256', v: txParams.value},
				{t:'bytes', v: txParams.data},
				txParams.action);
			var msgParams = { data : hash, from : txParams.from };
			_signMessage(msgParams, function(err, signature){
				if(err != null) cb(err, null);
				else
					_getUsername(txParams.from, function(err, username) {
						if(err != null) cb(err, null);
						else
							cb(null, constructMetaTransaction(txParams, signature, username));
					});
			});
		})
	}

	const _publishTransaction = function(rawTx, cb) { 
		_postTransaction(rawTx, cb);
	}

	const _signPersonalMessage = function(msgParams, cb) { 
		_getPrivateKey(msgParams.from, function(err, privateKey) {
		  if (err) return cb(err)
		  const serialized = sigUtil.personalSign(privateKey, msgParams)
		  cb(null, serialized)
		})
	}

	const _signTypedMessage = function(msgParams, cb) { 
		_getPrivateKey(msgParams.from, function(err, privateKey) {
		  if (err) return cb(err)
		  const serialized = sigUtil.signTypedData(privateKey, msgParams)
		  cb(null, serialized)
		})
	}
	
	var options = {
		approveTransaction : _approveTransaction,
		approveMessage : _approveMessage,
		approvePersonalMessage : _approvePersonalMessage,
		approveTypedMessage : _approveTypedMessage,
		signTransaction : _signTransaction,
		signMessage : _signMessage,
		signPersonalMessage : _signPersonalMessage,
		signTypedMessage : _signTypedMessage,
		publishTransaction : _publishTransaction
	}
	
	var engine = new ProviderEngine();
	var web3 = new Web3(engine);

	// static results
	engine.addProvider(new FixtureSubprovider({
	  web3_clientVersion: 'ProviderEngine/v0.0.0/javascript',
	  net_listening: true,
	  eth_hashrate: '0x00',
	  eth_mining: false,
	  eth_syncing: true,
	}))

	// cache layer
	engine.addProvider(new CacheSubprovider())

	// filters
	engine.addProvider(new FilterSubprovider())

	// pending nonce
	engine.addProvider(new NonceSubprovider())

	// vm
	engine.addProvider(new VmSubprovider())

	// id mgmt
	engine.addProvider(new HookedWalletSubprovider(options))

	// data source
	engine.addProvider(new RpcSubprovider({
	  rpcUrl: 'https://testrpc.metamask.io/',
	}))

	// log new blocks
	engine.on('block', function(block){
	  console.log('================================')
	  console.log('BLOCK CHANGED:', '#'+block.number.toString('hex'), '0x'+block.hash.toString('hex'))
	  console.log('================================')
	})

	// network connectivity error
	engine.on('error', function(err){
	  // report connectivity errors
	  console.error(err.stack)
	})

	// start polling for blocks
	engine.start()
	
	return engine;
}

export {
    CreateTapTrustProvider
};