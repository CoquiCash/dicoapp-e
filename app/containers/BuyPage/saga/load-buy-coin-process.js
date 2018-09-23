import swal from 'sweetalert';
// import { put, call, select, cancel, cancelled } from 'redux-saga/effects';
import { put, call, select, cancelled } from 'redux-saga/effects';
import { delay } from 'redux-saga';
import api from '../../../utils/barter-dex-api';
import {
  makeSelectCurrentUser,
  makeSelectBalanceEntities
} from '../../App/selectors';
import { loadBuyCoinError, loadBuyCoinSuccess } from '../actions';
import { makeSelectPricesEntities } from '../selectors';

const debug = require('debug')(
  'dicoapp:containers:BuyPage:saga:load-buy-coin-process'
);

const numcoin = 100000000;
const txfee = 10000;
const intervalTime = 5 * 1000; // 5s

export default function* loadBuyCoinProcess({ payload }) {
  try {
    // step one: load user data
    const user = yield select(makeSelectCurrentUser());
    if (!user) {
      throw new Error('not found user');
    }
    const { basecoin, paymentcoin, amount } = payload;

    const userpass = user.get('userpass');
    const coins = user.get('coins');
    const smartaddress = coins.find(c => c.get('coin') === paymentcoin);

    // step two: load balance
    const balances = yield select(makeSelectBalanceEntities());
    const balance = balances.find(c => c.get('coin') === paymentcoin);

    // step three: load best price
    const prices = yield select(makeSelectPricesEntities());
    const price = prices.find(c => c.get('rel') === paymentcoin);

    // step four: check balance
    const relvolume = Number(amount * price.get('price'));
    if (
      relvolume * numcoin + txfee >=
      Number(balance.get('balance') * numcoin).toFixed(0)
    ) {
      throw new Error('Not enough balance!');
    }

    let isSplittingTheFund = false;
    // const startTime = Date.now();

    while (true) {
      // const durationTime = Date.now() - startTime;
      // if (durationTime > 20 * 1000) {
      //   debug('cancel');
      //   yield cancel();
      // }

      // step five: get listUnspent data
      const unspent = yield call([api, 'listUnspent'], {
        userpass,
        coin: paymentcoin,
        address: smartaddress.get('smartaddress')
      });
      console.log(unspent);
      if (unspent.length < 2) {
        // splitting utxos
        debug('splitting utxos');
        if (!isSplittingTheFund) {
          swal(
            'Splitting Procedure',
            'You will need at least 2 UTXOs to perform your swap. We are trying to split it for you. Dont turn of the application.'
          );
          const buyparams = {
            userpass,
            base: basecoin,
            rel: paymentcoin,
            relvolume: relvolume.toFixed(8),
            price: price.get('bestPrice').toFixed(8)
          };
          const result = yield call([api, 'buy'], buyparams);
          debug('UTXO autosplit TX INFO:', result);
          if (result.error) {
            throw new Error(result.error);
          }
          isSplittingTheFund = true;
        }
      } else {
        debug('ready to buy');
        const buyparams = {
          userpass,
          base: basecoin,
          rel: paymentcoin,
          relvolume: relvolume.toFixed(8),
          price: price.get('bestPrice').toFixed(8)
        };

        const result = yield call([api, 'buy'], buyparams);
        if (result.error) {
          throw new Error(result.error);
        }
        if (result.pending) {
          return yield put(loadBuyCoinSuccess(result.pending));
        }
      }
      yield call(delay, intervalTime);
    }
  } catch (err) {
    return yield put(loadBuyCoinError(err.message));
  } finally {
    if (yield cancelled()) {
      debug('load buy coin process cancelled');
    }
  }
}
