import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ColorValue,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCustomerWallet } from '@/lib/api';
import type { CustomerWalletSummary, CustomerWalletTransaction } from '@/types/customer-request';
import appI18n from '@/localization/i18n';

function IconSymbol({
  name,
  color,
  size = 18,
}: {
  name: SymbolViewProps['name'];
  color: ColorValue;
  size?: number;
}) {
  return <SymbolView name={name} tintColor={color} size={size} resizeMode="scaleAspectFit" />;
}

function formatMoney(amount: number, currency: string | null | undefined): string {
  const code = currency?.trim() || 'CHF';

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return appI18n.t("{{value0}} {{value1}}", { value0: amount.toFixed(2), value1: code });
  }
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString(undefined, { hour12: false });
}

function getTransactionTitle(transaction: CustomerWalletTransaction): string {
  switch (transaction.type) {
    case 'TOP_UP':
      return appI18n.t("Wallet top-up");
    case 'HOLD':
      return appI18n.t("Reserved funds");
    case 'CAPTURE':
      return appI18n.t("Trip payment");
    case 'RELEASE':
      return appI18n.t("Released funds");
    case 'ADDITIONAL_CHARGE':
      return appI18n.t("Additional charge");
    case 'REFUND':
      return 'Refund';
    default:
      return transaction.type;
  }
}

function getTransactionTone(type: CustomerWalletTransaction['type']): {
  backgroundColor: string;
  textColor: string;
  icon: SymbolViewProps['name'];
} {
  switch (type) {
    case 'TOP_UP':
      return {
        backgroundColor: '#E9F9EE',
        textColor: '#1E9E4A',
        icon: { ios: 'plus', android: 'add', web: 'add' },
      };
    case 'REFUND':
    case 'RELEASE':
      return {
        backgroundColor: '#EEF4FF',
        textColor: '#2563EB',
        icon: { ios: 'arrow.counterclockwise', android: 'undo', web: 'undo' },
      };
    case 'CAPTURE':
    case 'ADDITIONAL_CHARGE':
      return {
        backgroundColor: '#FFF3D6',
        textColor: '#D89A1A',
        icon: { ios: 'creditcard.fill', android: 'payments', web: 'payments' },
      };
    default:
      return {
        backgroundColor: '#F3F4F6',
        textColor: '#68768A',
        icon: { ios: 'wallet.bifold.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' },
      };
  }
}

export default function WalletScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [wallet, setWallet] = useState<CustomerWalletSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;

    void (async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const response = await getCustomerWallet();
        if (active) {
          setWallet(response);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(error instanceof Error ? error.message : appI18n.t("Failed to load wallet."));
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [params.refreshTs]);

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAFA" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 18),
            paddingBottom: Math.max(insets.bottom + 32, 42),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <View style={styles.walletBadge}>
              <IconSymbol
                name={{ ios: 'wallet.bifold.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' }}
                color="#111827"
                size={20}
              />
            </View>
            <Text style={styles.walletLabel}>{appI18n.t("App Wallet")}</Text>
          </View>

          <Text style={styles.walletAmount}>
            {formatMoney(wallet?.availableBalance ?? 0, wallet?.currency)}
          </Text>
          <Text style={styles.walletMeta}>{appI18n.t("Available balance")}</Text>

          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>{appI18n.t("Total balance")}</Text>
              <Text style={styles.statValue}>
                {formatMoney(wallet?.balance ?? 0, wallet?.currency)}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>{appI18n.t("Reserved")}</Text>
              <Text style={styles.statValue}>
                {formatMoney(wallet?.reservedBalance ?? 0, wallet?.currency)}
              </Text>
            </View>
          </View>

          <Pressable
            style={styles.primaryButton}
            onPress={() =>
              router.push({
                pathname: '/wallet-top-up',
                params: {
                  currency: wallet?.currency ?? '',
                },
              })
            }
          >
            <Text style={styles.primaryButtonText}>{appI18n.t("Add Money")}</Text>
          </Pressable>

          <View style={styles.currencyRow}>
            <View style={styles.currencyIconWrap}>
              <IconSymbol
                name={{ ios: 'creditcard', android: 'payments', web: 'payments' }}
                color="#111827"
                size={16}
              />
            </View>
            <Text style={styles.currencyText}>
              {appI18n.t("Wallet currency:")} {wallet?.currency ?? appI18n.t("Set on first successful top-up")}
            </Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{appI18n.t("Recent activity")}</Text>

          {isLoading ? (
            <ActivityIndicator color="#111827" />
          ) : errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : wallet?.recentTransactions.length ? (
            wallet.recentTransactions.map((transaction) => {
              const tone = getTransactionTone(transaction.type);

              return (
                <View key={transaction.id} style={styles.transactionCard}>
                  <View style={styles.transactionHeader}>
                    <View style={styles.transactionTitleRow}>
                      <View style={[styles.transactionIconWrap, { backgroundColor: tone.backgroundColor }]}>
                        <IconSymbol name={tone.icon} color={tone.textColor} size={16} />
                      </View>
                      <View style={styles.transactionCopy}>
                        <Text style={styles.transactionTitle}>{getTransactionTitle(transaction)}</Text>
                        <Text style={styles.transactionMeta}>
                          {transaction.description || appI18n.t("Wallet activity")}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.transactionAmount, { color: tone.textColor }]}>
                      {formatMoney(transaction.amount, transaction.currency)}
                    </Text>
                  </View>
                  <Text style={styles.transactionDate}>{formatDate(transaction.createdAt)}</Text>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <IconSymbol
                  name={{ ios: 'clock.arrow.circlepath', android: 'history', web: 'history' }}
                  color="#98A2B3"
                  size={18}
                />
              </View>
              <Text style={styles.emptyText}>
                {appI18n.t("No wallet activity yet. Add money to start using your app wallet.")}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 16,
  },
  walletCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  walletBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  walletAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
  },
  walletMeta: {
    fontSize: 14,
    color: '#68768A',
    marginTop: 4,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  statCard: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    gap: 6,
  },
  statLabel: {
    fontSize: 12,
    color: '#68768A',
    fontWeight: '700',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#FFC548',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  primaryButtonText: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 15,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  currencyIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF7E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencyText: {
    flex: 1,
    color: '#68768A',
    fontSize: 13,
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E8EF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  transactionCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 10,
    marginTop: 12,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  transactionTitleRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  transactionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionCopy: {
    flex: 1,
    gap: 4,
  },
  transactionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  transactionMeta: {
    fontSize: 13,
    color: '#68768A',
    lineHeight: 18,
  },
  transactionDate: {
    fontSize: 12,
    color: '#98A2B3',
  },
  errorText: {
    color: '#B42318',
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 22,
    gap: 10,
    marginTop: 10,
  },
  emptyIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#68768A',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
