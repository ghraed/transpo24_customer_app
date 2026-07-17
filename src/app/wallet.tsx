import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { M3LoginColors } from '@/constants/theme';
import { getCustomerWallet } from '@/lib/api';
import type { CustomerWalletSummary, CustomerWalletTransaction } from '@/types/customer-request';

function formatMoney(amount: number, currency: string | null | undefined): string {
  const code = currency?.trim() || 'CHF';

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function getTransactionTitle(transaction: CustomerWalletTransaction): string {
  switch (transaction.type) {
    case 'TOP_UP':
      return 'Wallet top-up';
    case 'HOLD':
      return 'Reserved funds';
    case 'CAPTURE':
      return 'Trip payment';
    case 'RELEASE':
      return 'Released funds';
    case 'ADDITIONAL_CHARGE':
      return 'Additional charge';
    case 'REFUND':
      return 'Refund';
    default:
      return transaction.type;
  }
}

export default function WalletScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
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
          setErrorMessage(error instanceof Error ? error.message : 'Failed to load wallet.');
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
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>App Wallet</Text>
          <Text style={styles.heroAmount}>
            {formatMoney(wallet?.availableBalance ?? 0, wallet?.currency)}
          </Text>
          <Text style={styles.heroMeta}>
            Available balance
          </Text>
          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total</Text>
              <Text style={styles.statValue}>{formatMoney(wallet?.balance ?? 0, wallet?.currency)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Reserved</Text>
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
            <Text style={styles.primaryButtonText}>Add Money</Text>
          </Pressable>
          <Text style={styles.currencyText}>
            Wallet currency: {wallet?.currency ?? 'Set on first successful top-up'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          {isLoading ? (
            <ActivityIndicator color={M3LoginColors.primary} />
          ) : errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : wallet?.recentTransactions.length ? (
            wallet.recentTransactions.map((transaction) => (
              <View key={transaction.id} style={styles.transactionCard}>
                <View style={styles.transactionHeader}>
                  <Text style={styles.transactionTitle}>{getTransactionTitle(transaction)}</Text>
                  <Text style={styles.transactionAmount}>
                    {formatMoney(transaction.amount, transaction.currency)}
                  </Text>
                </View>
                <Text style={styles.transactionMeta}>
                  {transaction.description || 'Wallet activity'}
                </Text>
                <Text style={styles.transactionMeta}>{formatDate(transaction.createdAt)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>
              No wallet activity yet. Add money to start using your app wallet.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    padding: 18,
    gap: 12,
  },
  heroLabel: {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '600',
  },
  heroAmount: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  heroMeta: {
    color: '#94A3B8',
    fontSize: 14,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  statValue: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  currencyText: {
    color: '#CBD5E1',
    fontSize: 13,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 6,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  transactionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  transactionMeta: {
    color: '#64748B',
    fontSize: 13,
  },
  errorText: {
    color: M3LoginColors.error,
    fontSize: 14,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    lineHeight: 20,
  },
});
