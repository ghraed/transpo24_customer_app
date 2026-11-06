import React from 'react';
import { act, create } from 'react-test-renderer';
import WalletScreen from '../app/wallet';
const mockPush = jest.fn();
let mockPolicy = { directCharges: true };
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('@/components/payment-info', () => ({ PaymentInfo: () => null, usePaymentPolicy: () => ({ policy: mockPolicy }) }));
jest.mock('@/localization/i18n', () => ({ __esModule: true, default: { t: key => key } }));
jest.mock('@/lib/api', () => ({ getCustomerWallet: jest.fn(async () => ({ balance: 7, reservedBalance: 2, availableBalance: 5, currency: 'CHF', recentTransactions: [] })) }));
test('keeps existing balances readable and removes unavailable funding navigation for direct charges', async () => {
 let tree;
 await act(async () => { tree = create(<WalletScreen />); });
 expect(JSON.stringify(tree.toJSON())).toContain('5.00');
 expect(JSON.stringify(tree.toJSON())).not.toContain('Add Money');
 expect(mockPush).not.toHaveBeenCalled();
 await act(async () => tree.unmount());
});
test('retains top-up navigation when the active payment policy supports wallet funding', async () => {
 mockPolicy = { directCharges: false };
 let tree;
 await act(async () => { tree = create(<WalletScreen />); });
 let button = tree.root.findAll(node => node.props.children === 'Add Money')[0];
 while (typeof button.props.onPress !== 'function') button = button.parent;
 await act(async () => button.props.onPress());
 expect(mockPush).toHaveBeenCalledWith({ pathname: '/wallet-top-up', params: { currency: 'CHF' } });
 await act(async () => tree.unmount());
});
