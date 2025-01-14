import { defineStore } from 'pinia';
import { useBlockchain } from './useBlockchain';
import { fromBech32, toBech32, toHex, fromHex } from '@cosmjs/encoding';
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing';
import { Wallet } from 'ethers';
import type { Delegation, Coin, UnbondingResponses, DelegatorRewards, WalletConnected, IWallet } from '@/types';
import { useStakingStore } from './useStakingStore';
import router from '@/router';

export const useWalletStore = defineStore('walletStore', {
  state: () => {
    return {
      balances: [] as Coin[],
      delegations: [] as Delegation[],
      unbonding: [] as UnbondingResponses[],
      rewards: { total: [], rewards: [] } as DelegatorRewards,
      wallet: {} as WalletConnected,
      wallets: [
        {
          privateKey: 'f78a036930ce63791ea6ea20072986d8c3f16a6811f6a2583b0787c45086f769',
          name: 'admin',
          latest: true
        }
      ] as IWallet[]
    };
  },
  getters: {
    blockchain() {
      return useBlockchain();
    },
    connectedWallet() {
      // @ts-ignore
      if (this.wallet.cosmosAddress) return this.wallet;
      const chainStore = useBlockchain();
      const key = chainStore.defaultHDPath;
      const connected = JSON.parse(localStorage.getItem(key) || '{}');
      return connected;
    },
    balanceOfStakingToken(): Coin {
      const stakingStore = useStakingStore();
      return this.balances.find((x) => x.denom === stakingStore.params.bond_denom) || { amount: '0', denom: stakingStore.params.bond_denom };
    },
    stakingAmount() {
      const stakingStore = useStakingStore();
      let amt = 0;
      let denom = stakingStore.params.bond_denom;
      this.delegations.forEach((i) => {
        amt += Number(i.balance.amount);
        denom = i.balance.denom;
      });
      return { amount: String(amt), denom };
    },
    rewardAmount() {
      const stakingStore = useStakingStore();
      // @ts-ignore
      const reward = this.rewards.total?.find((x: Coin) => x.denom === stakingStore.params.bond_denom);
      return reward || { amount: '0', denom: stakingStore.params.bond_denom };
    },
    unbondingAmount() {
      let amt = 0;
      this.unbonding.forEach((i) => {
        i.entries.forEach((e) => {
          amt += Number(e.balance);
        });
      });

      const stakingStore = useStakingStore();
      return { amount: String(amt), denom: stakingStore.params.bond_denom };
    },
    currentAddress() {
      if (!this.connectedWallet?.cosmosAddress) return '';
      const { prefix, data } = fromBech32(this.connectedWallet.cosmosAddress);
      const chainStore = useBlockchain();
      return toBech32(chainStore.current?.bech32Prefix || prefix, data);
    },
    shortAddress() {
      const address: string = this.currentAddress;
      if (address.length > 4) {
        return `${address.substring(address.length - 4)}`;
      }
      return '';
    },
    latestWallet(): IWallet {
      for (const wallet of this.wallets) {
        if (wallet.latest) return wallet;
      }
      return this.wallets[0];
    }
  },
  actions: {
    async loadMyAsset() {
      if (!this.currentAddress) return;
      this.blockchain.rpc.getBankBalances(this.currentAddress).then((x) => {
        this.balances = x.balances;
      });
      this.blockchain.rpc.getStakingDelegations(this.currentAddress).then((x) => {
        this.delegations = x.delegation_responses;
      });
      this.blockchain.rpc.getStakingDelegatorUnbonding(this.currentAddress).then((x) => {
        this.unbonding = x.unbonding_responses;
      });
      this.blockchain.rpc.getDistributionDelegatorRewards(this.currentAddress).then((x) => {
        this.rewards = x;
      });
    },
    myBalance() {
      return this.blockchain.rpc.getBankBalances(this.currentAddress);
    },
    myDelegations() {
      return this.blockchain.rpc.getStakingDelegations(this.currentAddress);
    },
    myUnbonding() {
      return this.blockchain.rpc.getStakingDelegatorUnbonding(this.currentAddress);
    },
    async bech32Address() {
      const chainStore = useBlockchain();
      const prefix = chainStore.current?.bech32Prefix || chainStore.prefix;
      const hexAddress = await this.hexAddress();
      console.log('------>', hexAddress, prefix);
      return toBech32(prefix, fromHex(hexAddress.replace('0x', '')));
    },
    async hexAddress() {
      const chainStore = useBlockchain();
      if (chainStore.ecdsa === 'eth_secp265k1') {
        let w = new Wallet(this.latestWallet.privateKey);
        return w.address;
      } else {
        let w = await DirectSecp256k1Wallet.fromKey(fromHex(this.latestWallet.privateKey));
        const [curAcc] = await w.getAccounts();
        return '0x' + toHex(fromBech32(curAcc.address).data);
      }
    },
    disconnect() {
      const chainStore = useBlockchain();
      const key = chainStore.defaultHDPath;
      localStorage.removeItem(key);
      this.$reset();
    },
    setConnectedWallet(value: WalletConnected) {
      if (value) this.wallet = value;
    },
    suggestChain() {
      // const router = useRouter()
      router.push({ path: '/wallet/keplr' });
    }
  },
  persist: {
    key: 'wallet'
  }
});
