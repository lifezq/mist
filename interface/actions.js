exports.determineIfContract = function determineIfContract(toAddress) {
  return function(dispatch) {
    dispatch({ type: '[CLIENT]:DETERMINE_IF_CONTRACT:START' });

    if (!toAddress) {
      return dispatch({
        type: '[CLIENT]:DETERMINE_IF_CONTRACT:SUCCESS',
        payload: { toIsContract: true, isNewContract: true }
      });
    }

    web3.eth.getCode(toAddress, async (e, res) => {
      console.log('∆∆∆ getCode e', e);
      console.log('∆∆∆ getCode res', res);
      if (!e && res && res.length > 2) {
        return dispatch({
          type: '[CLIENT]:DETERMINE_IF_CONTRACT:SUCCESS',
          payload: { toIsContract: true, isNewContract: false }
        });
        // setWindowSize(template);
      }
    });
  };
};

exports.confirmTransaction = function confirmTransaction(data) {
  return async function(dispatch) {
    dispatch({ type: '[CLIENT]:CONFIRM_TRANSACTION:START' });

    // reject if sending to itself
    if (data.to && data.from === data.to.toLowerCase()) {
      displayNotification('sameAccount', 5);

      return dispatch({
        type: '[CLIENT]:CONFIRM_TRANSACTION:FAILURE',
        error: 'sameAccount'
      });
    }

    // reject if no gas
    if (!data.chosenGas || !_.isFinite(data.chosenGas)) {
      return dispatch({
        type: '[CLIENT]:CONFIRM_TRANSACTION:FAILURE',
        error: 'noGas'
      });
    }

    const nonce = await web3.eth.getTransactionCount(data.from);
    const tx = Object.assign({}, data, {
      nonce: `0x${nonce.toString(16)}`
    });

    let signedTx;
    await web3.eth.personal.signTransaction(tx, data.pw || '', function(
      error,
      result
    ) {
      if (error) {
        dispatch({
          type: '[CLIENT]:CONFIRM_TRANSACTION:FAILURE',
          error
        });

        if (error.message.includes('Unable to connect to socket: timeout')) {
          displayNotification('connectionTimeout', 5);
        } else if (
          error.message.includes('could not decrypt key with given passphrase')
        ) {
          displayNotification('wrongPassword', 3);
        } else if (error.message.includes('multiple keys match address')) {
          displayNotification('multipleKeysMatchAddress', 10);
        } else {
          GlobalNotification.warning({
            content: error.message || error,
            duration: 5
          });
        }
        return;
      }
      signedTx = result.raw;
    });

    if (!signedTx) {
      dispatch({
        type: '[CLIENT]:CONFIRM_TRANSACTION:FAILURE',
        error: 'no signedTx'
      });
    }

    web3.eth.sendSignedTransaction(signedTx, (error, hash) => {
      if (error) {
        console.error(`Error from sendSignedTransaction: ${error}`);
        if (error.message.includes('Unable to connect to socket: timeout')) {
          displayNotification('connectionTimeout', 5);
        } else if (
          error.message.includes('Insufficient funds for gas * price + value')
        ) {
          displayNotification('insufficientFundsForGas', 5);
        } else {
          GlobalNotification.warning({
            content: error.message || error,
            duration: 5
          });
        }

        return dispatch({
          type: '[CLIENT]:CONFIRM_TRANSACTION:FAILURE',
          error
        });
      }

      ipc.send('backendAction_unlockedAccountAndSentTransaction', null, hash);
      dispatch({ type: '[CLIENT]:CONFIRM_TRANSACTION:SUCCESS' });
    });
  };
};

function displayNotification(errorType, duration) {
  GlobalNotification.warning({
    content: TAPi18n.__(
      `mist.popupWindows.sendTransactionConfirmation.errors.${errorType}`
    ),
    duration
  });
}

exports.lookupSignature = function lookupSignature(data) {
  return dispatch => {
    dispatch({ type: '[CLIENT]:LOOKUP_SIGNATURE:START' });

    if (data && data.length > 8) {
      const bytesSignature =
        data.substr(0, 2) === '0x'
          ? data.substr(0, 10)
          : '0x' + data.substr(0, 8);

      if (_.first(window.SIGNATURES[bytesSignature])) {
        const executionFunction = _.first(window.SIGNATURES[bytesSignature]);

        dispatch({
          type: '[CLIENT]:LOOKUP_SIGNATURE:SUCCESS',
          payload: { executionFunction }
        });

        dispatch(decodeFunctionSignature(executionFunction, data));
      } else {
        fetch(
          `https://www.4byte.directory/api/v1/signatures/?hex_signature=${bytesSignature}`
        ).then(async response => {
          const fourByte = await response.json();
          console.log('∆∆∆ fourByte', fourByte);
        });
      }
    }
  };
};

function decodeFunctionSignature(signature, data) {
  return dispatch => {
    dispatch({ type: '[CLIENT]:DECODE_FUNCTION_SIGNATURE:START' });
    ipc.send('backendAction_decodeFunctionSignature', signature, data);
    ipc.on('uiAction_decodedFunctionSignatures', (event, params) => {
      console.log('∆∆∆ params (in action)', params);
      dispatch({
        type: '[CLIENT]:DECODE_FUNCTION_SIGNATURE:SUCCESS',
        payload: { params }
      });
    });
  };
}
