import { api } from '@/api';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { useUser } from '@clerk/clerk-expo';
import { useQuery } from 'convex/react';
import { type GenericId as Id } from 'convex/values';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  Dimensions,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

type PromoterOnlineByType = { name: string; count: number; revenue: number };
type PromoterRecentSale = {
  transactionId: string;
  createdAt: number;
  count: number;
  amount: number;
};

// ── Mini Bar Chart ──────────────────────────────────────────────────────────
function BarChart({
  data,
  mode,
}: {
  data: { label: string; count: number; revenue: number }[];
  mode: 'tickets' | 'revenue';
}) {
  const chartWidth = SCREEN_WIDTH - 64;
  const chartHeight = 120;
  const barPadding = 4;
  const barWidth = Math.max(4, (chartWidth - barPadding * (data.length - 1)) / data.length - barPadding);
  const maxVal = Math.max(...data.map((d) => (mode === 'tickets' ? d.count : d.revenue)), 1);

  // Show only every 3rd label to avoid overlap
  const showLabel = (i: number) => i % 3 === 0 || i === data.length - 1;

  return (
    <Svg width={chartWidth} height={chartHeight + 24}>
      {data.map((d, i) => {
        const val = mode === 'tickets' ? d.count : d.revenue;
        const barH = Math.max(2, (val / maxVal) * chartHeight);
        const x = i * (barWidth + barPadding);
        const y = chartHeight - barH;
        const isActive = val > 0;
        return (
          <React.Fragment key={d.label + i}>
            <Rect
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              rx={3}
              fill={isActive ? '#E65CFF' : '#1e1e2e'}
              opacity={isActive ? 1 : 0.4}
            />
            {showLabel(i) && (
              <SvgText
                x={x + barWidth / 2}
                y={chartHeight + 16}
                fontSize={8}
                fill="#555"
                textAnchor="middle"
              >
                {d.label}
              </SvgText>
            )}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: string;
  color: string;
}) {
  return (
    <View
      className="flex-1 bg-backgroundCard rounded-2xl p-4 border border-white/5"
      style={{ minWidth: 0 }}
    >
      <View
        className="w-9 h-9 rounded-xl items-center justify-center mb-3"
        style={{ backgroundColor: `${color}20` }}
      >
        <IconSymbol name={icon as any} size={18} color={color} />
      </View>
      <Text className="text-white font-black text-xl" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text className="text-textSecondary text-[10px] font-bold uppercase mt-0.5 tracking-widest" numberOfLines={1}>
        {label}
      </Text>
      {sub ? (
        <Text className="text-gray-600 text-[10px] mt-0.5" numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function PromoterDashboardScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { user } = useUser();

  const [chartMode, setChartMode] = useState<'tickets' | 'revenue'>('tickets');
  const [copied, setCopied] = useState(false);

  const event = useQuery(api.events.getEventBasicInfo, {
    eventId: eventId as Id<'events'>,
  });

  const promoter = useQuery(
    api.promoters.getPromoterByUserAndEvent,
    user?.id ? { userId: user.id, eventId: eventId as Id<'events'> } : 'skip'
  );

  const dashboard = useQuery(
    api.promoters.getPromoterOnlineDashboard,
    promoter?.code ? { eventId: eventId as Id<'events'>, promoterCode: promoter.code } : 'skip'
  );

  const isLoading = event === undefined || promoter === undefined || dashboard === undefined;

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background">
        <ActivityIndicator size="large" color="#E65CFF" />
        <Text className="text-white mt-4 font-medium">Carregando painel...</Text>
      </SafeAreaView>
    );
  }

  if (!promoter) {
    return (
      <SafeAreaView className="flex-1 justify-center items-center bg-background px-8">
        <IconSymbol name="xmark.circle" size={48} color="#ef4444" />
        <Text className="text-white text-lg font-semibold mt-4 text-center">Acesso negado</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-6 bg-backgroundCard px-6 py-3 rounded-xl">
          <Text className="text-white font-medium">Voltar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const { totals, byType, timeSeries, recentSales } = dashboard!;
  const hasData = totals.totalTickets > 0;
  const rawRate = promoter.commissionRate ?? 0;
  const commissionRate = rawRate > 1 ? rawRate / 100 : rawRate;
  const commissionPct = (commissionRate * 100).toFixed(0);

  const promoterLink = `www.ingressify.com.br/event/${event?.slug ?? ''}?link=${promoter.code}`;

  const handleCopyLink = () => {
    Clipboard.setString(`https://${promoterLink}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="px-6 py-4 flex-row items-center border-b border-white/5">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <IconSymbol name="arrow.left" size={24} color="#E65CFF" />
        </TouchableOpacity>
        <View className="flex-1 ml-2">
          <Text className="text-white font-bold text-lg">Meu Painel</Text>
          <Text className="text-gray-500 text-xs" numberOfLines={1}>
            {event?.name ?? ''}
          </Text>
        </View>
        {/* Promoter badge */}
        <View className="bg-yellow-500/15 px-3 py-1.5 rounded-full flex-row items-center gap-1.5">
          <View className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
          <Text className="text-yellow-400 text-[10px] font-bold uppercase tracking-widest">
            {promoter.code}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        {/* Ação rápida: Venda Offline */}
        <TouchableOpacity
          onPress={() => router.push(`/scanner/offline/${eventId}` as any)}
          className="bg-yellow-500 rounded-2xl px-5 py-4 flex-row items-center justify-between mb-6"
          activeOpacity={0.85}
        >
          <View className="flex-row items-center gap-3">
            <View className="w-9 h-9 rounded-xl bg-black/20 items-center justify-center">
              <IconSymbol name="bag" size={18} color="black" />
            </View>
            <View>
              <Text className="text-black font-bold text-sm">Registrar Venda Offline</Text>
                <Text className="text-black/60 text-xs mt-0.5">Venda paga por fora da plataforma</Text>
              </View>
          </View>
          <IconSymbol name="chevron.right" size={16} color="black" />
        </TouchableOpacity>

        {/* Link do promoter */}
        <View className="bg-backgroundCard rounded-2xl border border-white/5 mb-6 overflow-hidden">
          <View className="px-4 pt-4 pb-3">
            <Text className="text-textSecondary text-[10px] font-bold uppercase tracking-widest mb-2">Seu link de vendas</Text>
            <Text className="text-gray-400 text-xs font-mono" numberOfLines={1} ellipsizeMode="tail">
              {promoterLink}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleCopyLink}
            activeOpacity={0.8}
            className={`flex-row items-center justify-center gap-2 py-3 border-t border-white/5 ${copied ? 'bg-green-500/10' : 'bg-white/3'}`}
          >
            <IconSymbol
              name={copied ? 'checkmark.circle.fill' : 'doc.on.doc'}
              size={15}
              color={copied ? '#10b981' : '#E65CFF'}
            />
            <Text className={`text-sm font-bold ${copied ? 'text-green-400' : 'text-primary'}`}>
              {copied ? 'Link copiado!' : 'Copiar link'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* KPI Row */}
        <View className="flex-row gap-3 mb-4">
          <KpiCard
            icon="ticket"
            color="#E65CFF"
            label="Ingressos"
            value={String(totals.totalTickets)}
          />
          <KpiCard
            icon="brazilianrealsign"
            color="#10b981"
            label="Receita gerada"
            value={BRL(totals.totalRevenue)}
          />
        </View>

        {commissionRate > 0 && (
          <View className="flex-row gap-3 mb-6">
            <KpiCard
              icon="dollarsign.circle"
              color="#f59e0b"
              label="Comissão estimada"
              value={BRL(totals.estimatedCommission)}
              sub={`${commissionPct}% sobre vendas online`}
            />
            <View className="flex-1" />
          </View>
        )}

        {/* Chart */}
        <View className="bg-backgroundCard rounded-3xl p-5 border border-white/5 mb-5">
          {/* Chart header */}
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-white font-bold text-base">Vendas por dia</Text>
              <Text className="text-gray-500 text-xs mt-0.5">Últimos 14 dias</Text>
            </View>
            <View className="flex-row bg-background rounded-xl p-1 border border-white/5">
              <TouchableOpacity
                onPress={() => setChartMode('tickets')}
                className={`px-3 py-1.5 rounded-lg ${chartMode === 'tickets' ? 'bg-primary/20' : ''}`}
              >
                <Text className={`text-xs font-bold ${chartMode === 'tickets' ? 'text-primary' : 'text-gray-500'}`}>
                  Qtd
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setChartMode('revenue')}
                className={`px-3 py-1.5 rounded-lg ${chartMode === 'revenue' ? 'bg-green-500/20' : ''}`}
              >
                <Text className={`text-xs font-bold ${chartMode === 'revenue' ? 'text-green-400' : 'text-gray-500'}`}>
                  R$
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {hasData ? (
            <BarChart data={timeSeries} mode={chartMode} />
          ) : (
            <View className="h-36 items-center justify-center">
              <IconSymbol name="chart.bar" size={36} color="#333" />
              <Text className="text-gray-600 text-sm mt-3 text-center">
                Nenhuma venda ainda.{'\n'}Compartilhe seu link para começar!
              </Text>
            </View>
          )}
        </View>

        {/* Ticket type breakdown */}
        {byType.length > 0 && (
          <View className="bg-backgroundCard rounded-3xl p-5 border border-white/5 mb-5">
            <Text className="text-white font-bold text-base mb-4">Por tipo de ingresso</Text>
            {byType.map((item: PromoterOnlineByType, idx: number) => {
              const maxCount = byType[0].count || 1;
              const pct = (item.count / maxCount) * 100;
              return (
                <View key={idx} className="mb-4 last:mb-0">
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-white text-sm font-semibold flex-1 mr-2" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <Text className="text-gray-400 text-xs">
                        {item.count}x
                      </Text>
                      <Text className="text-gray-500 text-xs">
                        {BRL(item.revenue)}
                      </Text>
                    </View>
                  </View>
                  <View className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <View
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Recent sales */}
        {recentSales.length > 0 && (
          <View className="bg-backgroundCard rounded-3xl p-5 border border-white/5">
            <Text className="text-white font-bold text-base mb-4">Vendas recentes</Text>
            {recentSales.map((sale: PromoterRecentSale, idx: number) => {
              const date = new Date(sale.createdAt);
              const formatted = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
              return (
                <View
                  key={sale.transactionId + idx}
                  className={`flex-row items-center py-3 ${idx < recentSales.length - 1 ? 'border-b border-white/5' : ''}`}
                >
                  <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center mr-3">
                    <IconSymbol name="ticket" size={14} color="#E65CFF" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-white text-sm font-semibold">
                      {sale.count}x ingresso
                    </Text>
                    <Text className="text-gray-500 text-xs mt-0.5">{formatted}</Text>
                  </View>
                  <Text className="text-green-400 text-sm font-bold">
                    {BRL(sale.amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {!hasData && (
          <View className="bg-backgroundCard rounded-3xl p-8 border border-white/5 items-center">
            <View className="w-16 h-16 rounded-2xl bg-primary/10 items-center justify-center mb-4">
              <IconSymbol name="link" size={32} color="#E65CFF" />
            </View>
            <Text className="text-white font-bold text-base text-center">
              Compartilhe seu link
            </Text>
            <Text className="text-gray-500 text-sm text-center mt-2 leading-5">
              Suas vendas online aparecerão aqui assim que alguém comprar usando o código{' '}
              <Text className="text-primary font-bold">{promoter.code}</Text>.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
