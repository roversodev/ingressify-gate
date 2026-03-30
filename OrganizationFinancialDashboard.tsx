"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { sendWithdrawalNotification } from "@/app/actions/sendWithdrawalNotification";
import { Key, useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CreditCard, Building2, Calendar, TrendingUp, CreditCardIcon, BanknoteIcon, ArrowDownIcon, ChevronLeftIcon, ChevronRightIcon, Copy, Download, Eye, FileText, Clock, CheckCircle, XCircle, AlertCircle, User, Mail, Phone, Hash, MapPin, DollarSign, MessageCircle, AlertTriangle, MonitorOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { feeCalculations } from '@/lib/fees';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function OrganizationFinancialDashboard() {
    const { user } = useUser();
    const searchParams = useSearchParams();
    const orgId = searchParams.get("org");
    
    // Adicionar o hook useAction para obter URLs do storage
    const getStorageUrl = useAction(api.storage.getUrlOnce);
    
    const [activeTab, setActiveTab] = useState("transactions");
    const [filterPaymentMethod, setFilterPaymentMethod] = useState("all");
    const [filterStatus, setFilterStatus] = useState("all");
    const [filterEvent, setFilterEvent] = useState("all");
    const [withdrawalAmount, setWithdrawalAmount] = useState("");
    const [isWithdrawalDialogOpen, setIsWithdrawalDialogOpen] = useState(false);
    const [selectedPixKeyIndex, setSelectedPixKeyIndex] = useState(0);
    const [selectedEventId, setSelectedEventId] = useState("");
    const [selectedWithdrawal, setSelectedWithdrawal] = useState<any>(null);
    const [isWithdrawalSheetOpen, setIsWithdrawalSheetOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
    const [isTransactionSheetOpen, setIsTransactionSheetOpen] = useState(false);

    // Adicionar estado para paginação e loading
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoadingPage, setIsLoadingPage] = useState(false);
    const itemsPerPage = 10;

    // Buscar dados financeiros da organização com filtro por evento
    const financialStats = useQuery(api.organizations.getOrganizationFinancialSummary, {
        organizationId: orgId as Id<"organizations">,
        userId: user?.id || "",
        eventId: filterEvent !== "all" ? filterEvent as Id<"events"> : undefined,
    });

    // Buscar transações da organização com paginação e filtros
    const transactionsData = useQuery(api.organizations.getOrganizationTransactionsPaginated, {
        organizationId: orgId as Id<"organizations">,
        userId: user?.id || "",
        page: currentPage,
        limit: itemsPerPage,
        paymentMethod: filterPaymentMethod !== "all" ? filterPaymentMethod : undefined,
        status: filterStatus !== "all" ? filterStatus : undefined,
        eventId: filterEvent !== "all" ? filterEvent as Id<"events"> : undefined,
    });

    // Buscar eventos da organização para o filtro
    const organizationEvents = useQuery(
        api.events.getOrganizationEvents,
        orgId ? { organizationId: orgId as Id<"organizations"> } : "skip"
    );

    // Buscar dados da organização
    const organization = useQuery(api.organizations.getOrganizationById, {
        organizationId: orgId as Id<"organizations">,
    });

    // Buscar histórico de saques com filtro por evento
    const withdrawals = useQuery(api.organizations.getOrganizationWithdrawals, {
        organizationId: orgId as Id<"organizations">,
        userId: user?.id || "",
        eventId: filterEvent !== "all" ? filterEvent as Id<"events"> : undefined, // Aplicar filtro por evento
    });

    // Buscar dados financeiros específicos para o evento selecionado no modal
    const selectedEventStats = useQuery(api.organizations.getOrganizationFinancialSummary, 
        selectedEventId ? {
            organizationId: orgId as Id<"organizations">,
            userId: user?.id || "",
            eventId: selectedEventId as Id<"events">,
        } : "skip"
    );

    // Buscar saques específicos para o evento selecionado no modal
    const selectedEventWithdrawalsList = useQuery(api.organizations.getOrganizationWithdrawals, 
        selectedEventId ? {
            organizationId: orgId as Id<"organizations">,
            userId: user?.id || "",
            eventId: selectedEventId as Id<"events">,
        } : "skip"
    );

    // Calcular saldo disponível para o modal
    const modalStats = selectedEventStats ? {
        availableCardAmount: selectedEventStats.paymentMethodStats.card.availableAmount,
        availablePixAmount: selectedEventStats.paymentMethodStats.pix.availableAmount,
    } : { availableCardAmount: 0, availablePixAmount: 0 };

    const modalOfflineAdjustment = (selectedEventStats as any)?.offlineAdjustmentTotal ?? 0;

    const modalTotalWithdrawn = selectedEventWithdrawalsList
        ? selectedEventWithdrawalsList
            .filter(w => w.status === "completed" || w.status === "processing" || w.status === "pending")
            .reduce((sum, w) => sum + w.amount, 0)
        : 0;

    const modalAvailableBalance = Math.max(0, (modalStats.availablePixAmount + modalStats.availableCardAmount + modalOfflineAdjustment) - modalTotalWithdrawn);

    // Mutation para solicitar saque
    const requestWithdrawal = useMutation(api.organizations.requestWithdrawal);

    // Buscar configurações de taxa para todos os eventos da organização
    const allEventFeeSettings = useQuery(
        api.eventFeeSettings.getAllEventFeeSettingsByOrganization,
        orgId ? { organizationId: orgId as Id<"organizations"> } : "skip"
    );

    // Criar mapa de configurações de taxa por eventId usando useMemo
    const eventFeeSettingsMap = useMemo(() => {
        const map = new Map();
        if (allEventFeeSettings) {
            allEventFeeSettings.forEach((setting: any) => {
                map.set(setting.eventId, setting);
            });
        }
        return map;
    }, [allEventFeeSettings]);

    // Função para obter eventFeeSettings por eventId
    const getEventFeeSettings = (eventId: string) => {
        return eventFeeSettingsMap.get(eventId) || undefined;
    };

    // Função para calcular a taxa aplicada em porcentagem
    const calculateAppliedFeePercentage = (paymentMethod: string, eventFeeSettings?: any) => {
        const method = paymentMethod === "CARD" ? "CARD" : "PIX";

        if (eventFeeSettings && eventFeeSettings.useCustomFees) {
            return method === "CARD" ? eventFeeSettings.cardFeePercentage * 100 : eventFeeSettings.pixFeePercentage * 100;
        }

        return method === "CARD" ? 10 : 10;
    };

    const formatCurrency = (value: number) => {
        if (Math.abs(value) < 0.01) {
            value = 0;
        }
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(value);
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const getStatusBadge = (status: string) => {
        const statusConfig = {
            pending: { label: "Pendente", variant: "pending" as const },
            completed: { label: "Pago", variant: "default" as const },
            processing: { label: "Processando", variant: "processing" as const },
            failed: { label: "Falhou", variant: "destructive" as const },
            cancelled: { label: "Cancelado", variant: "destructive" as const },
            canceled: { label: "Cancelado", variant: "destructive" as const },
            paid: { label: "Pago", variant: "default" as const },
            refunded: { label: "Reembolsado", variant: "destructive" as const },
            charged_back: { label: "Chargeback", variant: "chargedback" as const },
        };

        const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
        return <Badge variant={config.variant}>{config.label}</Badge>;
    };

    const getPaymentMethodBadge = (method: string) => {
        if (method === "CARD") {
            return (
                <Badge variant="outline" className="flex items-center gap-1 border-none text-purple-500">
                    <svg viewBox="0 0 28 20" fill="none" xmlns="" className="h-3 w-3">
                        <path d="M28 4.91406V3.4375C28 1.74612 26.6289 0.375 24.9375 0.375H3.0625C1.37112 0.375 0 1.74612 0 3.4375V4.91406C0 5.06505 0.122445 5.1875 0.273438 5.1875H27.7266C27.8776 5.1875 28 5.06505 28 4.91406Z" fill="currentColor"></path>
                        <path d="M0 7.21094V16.5625C0 18.2539 1.37112 19.625 3.0625 19.625H24.9375C26.6289 19.625 28 18.2539 28 16.5625V7.21094C28 7.05995 27.8776 6.9375 27.7266 6.9375H0.273438C0.122445 6.9375 0 7.05995 0 7.21094ZM7 14.375C7 14.8582 6.60822 15.25 6.125 15.25H5.25C4.76678 15.25 4.375 14.8582 4.375 14.375V13.5C4.375 13.0168 4.76678 12.625 5.25 12.625H6.125C6.60822 12.625 7 13.0168 7 13.5V14.375Z" fill="currentColor"></path>
                    </svg>
                    Cartão
                </Badge>
            );
        } else if (method === "pix") {
            return (
                <Badge variant="outline" className="flex items-center gap-1 border-none text-blue-500">
                    <svg viewBox="0 0 39 39" fill="none" xmlns="" className="h-3 w-3">
                        <path d="M30.4124 29.8356C29.6599 29.8373 28.9146 29.69 28.2193 29.4021C27.5241 29.1143 26.8927 28.6916 26.3617 28.1585L20.5112 22.3081C20.3041 22.1114 20.0294 22.0017 19.7437 22.0017C19.4581 22.0017 19.1833 22.1114 18.9762 22.3081L13.1035 28.1808C12.5726 28.7141 11.9413 29.137 11.246 29.4248C10.5507 29.7127 9.8053 29.8599 9.05278 29.8579H7.89941L15.3099 37.2685C17.6223 39.5808 21.3749 39.5808 23.6872 37.2685L31.1172 29.8356H30.4124ZM9.05278 9.14188C10.585 9.14188 12.0226 9.73807 13.1035 10.819L18.9762 16.6917C19.0771 16.7928 19.197 16.873 19.3289 16.9277C19.4609 16.9824 19.6023 17.0106 19.7451 17.0106C19.888 17.0106 20.0294 16.9824 20.1613 16.9277C20.2933 16.873 20.4131 16.7928 20.514 16.6917L26.3644 10.8413C26.895 10.3083 27.5259 9.88566 28.2206 9.59781C28.9154 9.30995 29.6603 9.16257 30.4124 9.16417H31.1172L23.6872 1.73414C22.576 0.623749 21.0694 0 19.4986 0C17.9277 0 16.4211 0.623749 15.3099 1.73414L7.89941 9.14467L9.05278 9.14188Z" fill="currentColor"></path>
                        <path d="M37.2658 15.31L32.7749 10.8191C32.6741 10.8605 32.5663 10.8822 32.4573 10.8831H30.4152C29.3594 10.8831 28.3258 11.3122 27.5819 12.0588L21.7315 17.9092C21.4713 18.1708 21.162 18.3783 20.8214 18.5199C20.4807 18.6615 20.1155 18.7345 19.7466 18.7345C19.3776 18.7345 19.0124 18.6615 18.6717 18.5199C18.3311 18.3783 18.0218 18.1708 17.7616 17.9092L11.8889 12.0337C11.1354 11.2834 10.1162 10.8608 9.05283 10.8581H6.5455C6.44156 10.8572 6.33865 10.8374 6.24184 10.7996L1.73423 15.31C-0.578077 17.6223 -0.578077 21.3749 1.73423 23.69L6.24184 28.1976C6.33758 28.1591 6.43954 28.1383 6.54272 28.1363H9.05283C10.1115 28.1363 11.1423 27.7101 11.8889 26.9634L17.7588 21.0879C18.2944 20.578 19.0056 20.2936 19.7452 20.2936C20.4847 20.2936 21.1959 20.578 21.7315 21.0879L27.5819 26.9384C28.3258 27.685 29.3594 28.1112 30.4152 28.1112H32.4573C32.5687 28.1112 32.6774 28.1391 32.7749 28.1781L37.2658 23.6872C39.5781 21.3749 39.5781 17.6223 37.2658 15.31Z" fill="currentColor"></path>
                    </svg>
                    PIX
                </Badge>
            );
        } else if (method === "OFFLINE_ADJUSTMENT") {
            return (
                <Badge variant="outline" className="flex items-center gap-1 border-none text-red-500">
                    <MonitorOff className="h-3 w-3" />
                    Off
                </Badge>
            );
        } else if (method === "OFFLINE_ADJUSTMENT_REFUND") {
            return (
                <Badge variant="outline" className="flex items-center gap-1 border-none text-red-500">
                    <MonitorOff className="h-3 w-3" />
                    Off Reembolso
                </Badge>
            );
        }
        return <Badge variant="outline">{method}</Badge>;
    };

    // Calcular estatísticas de transações baseadas nos dados do financialStats
    const transactionStats = financialStats ? {
        total: financialStats.paymentMethodStats.card.count + financialStats.paymentMethodStats.pix.count,
        totalAmount: financialStats.paymentMethodStats.card.amount + financialStats.paymentMethodStats.pix.amount,
        cardTransactions: financialStats.paymentMethodStats.card.count,
        pixTransactions: financialStats.paymentMethodStats.pix.count,
        cardAmount: financialStats.paymentMethodStats.card.amount,
        pixAmount: financialStats.paymentMethodStats.pix.amount,
        pendingCardAmount: financialStats.paymentMethodStats.card.pendingAmount,
        pendingPixAmount: (financialStats.paymentMethodStats as any).pix.pendingAmount || 0,
        availableCardAmount: financialStats.paymentMethodStats.card.availableAmount,
        availablePixAmount: financialStats.paymentMethodStats.pix.availableAmount,
        chargebackCount: (financialStats as any).chargebackCount || 0,
    } : {
        total: 0,
        totalAmount: 0,
        cardTransactions: 0,
        pixTransactions: 0,
        cardAmount: 0,
        pixAmount: 0,
        pendingCardAmount: 0,
        availableCardAmount: 0,
        availablePixAmount: 0,
        chargebackCount: 0,
    };

    const offlineAdjustmentTotal = (financialStats as any)?.offlineAdjustmentTotal ?? 0;

    // Calcular total sacado (agora considerando filtro por evento corretamente)
    const totalWithdrawn = withdrawals
        ? withdrawals
            .filter(w => w.status === "completed" || w.status === "processing" || w.status === "pending")
            .reduce((sum, w) => sum + w.amount, 0)
        : 0;

    // Função para formatar o valor do saque enquanto o usuário digita
    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // Remover tudo que não é dígito
        const numericValue = value.replace(/\D/g, "");

        if (numericValue === "") {
            setWithdrawalAmount("");
            return;
        }

        // Converter para centavos
        const amount = parseInt(numericValue) / 100;

        // Formatar como moeda BRL
        const formatted = new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(amount);

        setWithdrawalAmount(formatted);
    };

    // Função para lidar com a solicitação de saque
    const handleWithdrawalRequest = async () => {
        try {
            if (!organization) return;

            // Verificar se há chaves PIX cadastradas
            if (!organization.pixKeys || organization.pixKeys.length === 0) {
                toast.error("Erro ao solicitar saque", {
                    description: "Você precisa cadastrar pelo menos uma chave PIX para solicitar saques.",
                });
                return;
            }

            // Verificar se um evento foi selecionado
            if (!selectedEventId || selectedEventId === "") {
                toast.error("Evento obrigatório", {
                    description: "Por favor, selecione um evento para associar ao saque.",
                });
                return;
            }

            // Verificar se o valor é válido
            // Remover caracteres não numéricos exceto vírgula (que separa decimais) e converter
            // Ex: "R$ 1.234,56" -> "1234,56" -> "1234.56"
            const cleanValue = withdrawalAmount.replace(/[^\d,]/g, "").replace(",", ".");
            const amountInReais = parseFloat(cleanValue);

            if (isNaN(amountInReais) || amountInReais <= 0) {
                toast.error("Valor inválido", {
                    description: "Por favor, informe um valor válido para o saque."
                });
                return;
            }

            // Verificar se há saldo disponível
            // Usar o saldo calculado especificamente para o evento selecionado
            const availableBalanceToCheck = selectedEventId ? modalAvailableBalance : 0;
            
            // Usar toFixed(2) para garantir precisão de 2 casas decimais
            if (parseFloat(amountInReais.toFixed(2)) > parseFloat(availableBalanceToCheck.toFixed(2))) {
                toast.error("Saldo insuficiente", {
                    description: "O valor solicitado é maior que o saldo disponível para saque neste evento.",
                });
                return;
            }

            // Solicitar o saque - Converter para centavos aqui
            const result = await requestWithdrawal({
                organizationId: orgId as Id<"organizations">,
                userId: user?.id || "",
                amount: amountInReais,
                pixKeyIndex: selectedPixKeyIndex,
                eventId: selectedEventId as Id<"events">, // Mudança: sempre enviar o eventId
            });

            // Verificar se a operação foi bem-sucedida
            if (result.success) {
                // Enviar notificação para admins
                const requesterName = user?.fullName || user?.firstName || "Usuário";
                sendWithdrawalNotification({
                    organizationName: organization?.name || "Organização",
                    amount: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amountInReais),
                    requesterName,
                    withdrawalId: result.withdrawalId?.toString()
                }).catch(err => console.error("Falha ao enviar notificação de saque:", err));

                // Fechar o modal e exibir mensagem de sucesso
                setIsWithdrawalDialogOpen(false);
                setWithdrawalAmount("");
                setSelectedEventId(""); // Reset do evento selecionado
                toast.success("Solicitação enviada", {
                    description: "Sua solicitação de saque foi enviada com sucesso e será processada em breve.",
                });
            } else {
                // Exibir mensagem de erro específica
                toast.error("Erro ao solicitar saque", {
                    description: result.message || "Ocorreu um erro ao processar sua solicitação.",
                });
            }
        } catch (error) {
            // Este bloco agora captura apenas erros de rede ou internos
            console.error("Erro ao solicitar saque:", error);
            toast.error("Erro de conexão", {
                description: "Ocorreu um erro de conexão. Por favor, verifique sua internet e tente novamente.",
            });
        }
    };

    // Paginação baseada em hasMore
    const handleNextPage = () => {
        if (transactionsData?.hasMore) {
            setIsLoadingPage(true);
            setCurrentPage(currentPage + 1);
        }
    };

    const handlePrevPage = () => {
        if (currentPage > 1) {
            setIsLoadingPage(true);
            setCurrentPage(currentPage - 1);
        }
    };

    // Reset da paginação quando os filtros mudarem
    useEffect(() => {
        setCurrentPage(1);
        setIsLoadingPage(false);
    }, [filterPaymentMethod, filterStatus, filterEvent]);

    // Resetar loading quando os dados chegarem
    useEffect(() => {
        if (transactionsData) {
            setIsLoadingPage(false);
        }
    }, [transactionsData]);

    // Função para copiar texto para clipboard
    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`${label} copiado para a área de transferência`);
    };

    // Função para abrir detalhes do saque
    const openWithdrawalDetails = (withdrawal: any) => {
        setSelectedWithdrawal(withdrawal);
        setIsWithdrawalSheetOpen(true);
    };

    // Função para abrir detalhes da transação
    const openTransactionDetails = (transaction: any) => {
        setSelectedTransaction(transaction);
        setIsTransactionSheetOpen(true);
    };

    // Função para baixar comprovante (se disponível)
    const downloadReceipt = async (receiptStorageId: string) => {
        try {
            // Obter a URL do arquivo no storage
            const fileUrl = await getStorageUrl({ storageId: receiptStorageId as any });
            
            if (!fileUrl) {
                toast.error("Erro ao obter URL do comprovante");
                return;
            }

            // Criar um elemento <a> temporário para fazer o download
            const link = document.createElement('a');
            link.href = fileUrl;
            link.download = `comprovante-${receiptStorageId}.pdf`; // Nome padrão do arquivo
            link.target = '_blank';
            
            // Adicionar ao DOM, clicar e remover
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            toast.success("Download iniciado");
        } catch (error) {
            console.error("Erro ao baixar comprovante:", error);
            toast.error("Erro ao baixar comprovante");
        }
    };

    // Função para obter o nome do evento
    const getEventName = (eventId: string) => {
        const event = organizationEvents?.find(e => e._id === eventId);
        return event?.name || "Evento não encontrado";
    };

    // Função para formatar tipo de chave PIX
    const formatPixKeyType = (keyType: string) => {
        const types = {
            cpf: "CPF",
            cnpj: "CNPJ", 
            email: "E-mail",
            phone: "Telefone",
            random: "Chave Aleatória"
        };
        return types[keyType as keyof typeof types] || keyType;
    };

    // Função para criar link do WhatsApp
    const createWhatsAppLink = (phoneNumber: string, customerName: string) => {
        if (!phoneNumber) return null;
        
        // Remove caracteres não numéricos
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        
        // Adiciona código do país se não tiver
        const formattedPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
        
        const message = encodeURIComponent(`Olá ${customerName}, tudo bem? Sou da equipe do evento e gostaria de falar com você.`);
        
        return ``;
    };

    // Função para obter ícone do status
    const getStatusIcon = (status: string) => {
        switch (status) {
            case "completed":
                return <CheckCircle className="h-4 w-4 text-green-500" />;
            case "processing":
                return <Clock className="h-4 w-4 text-blue-500" />;
            case "pending":
                return <AlertCircle className="h-4 w-4 text-yellow-500" />;
            case "failed":
            case "cancelled":
                return <XCircle className="h-4 w-4 text-red-500" />;
            case "canceled":
                return <XCircle className="h-4 w-4 text-red-500" />;
            default:
                return <AlertCircle className="h-4 w-4 text-gray-500" />;
        }
    };

    if (!financialStats || !organization) {
        return (
            <div className="container mx-auto px-4 py-8">
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-destaque"></div>
                </div>
            </div>
        );
    }

    // Verificar se há saldo disponível para saque
    const netAvailableBalance = (transactionStats.availablePixAmount + transactionStats.availableCardAmount + offlineAdjustmentTotal) - totalWithdrawn;
    const isNegativeBalance = netAvailableBalance < -0.01;
    const availableBalance = netAvailableBalance;
    const canWithdraw = availableBalance >= 1;

    return (
        <div className="container mx-auto py-8">
            <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Financeiro - {organization.name}</h1>
                    <p className="text-secondaryCustom mt-2">
                        Acompanhe as transações e o saldo disponível da sua organização
                    </p>
                </div>

                {/* Botão de Solicitar Saque */}
                <div className="mt-4 md:mt-0">
                    <Dialog open={isWithdrawalDialogOpen} onOpenChange={setIsWithdrawalDialogOpen}>
                        <DialogTrigger asChild>
                            <Button
                                className="bg-destaque text-white"
                                disabled={!canWithdraw}
                            >
                                <ArrowDownIcon className="mr-2 h-4 w-4" />
                                Solicitar Saque
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-zinc-900 border border-zinc-700 text-white">
                            <DialogHeader>
                                <DialogTitle className="text-white">Solicitar Saque</DialogTitle>
                                <DialogDescription className="text-secondaryCustom">
                                    Preencha os dados abaixo para solicitar um saque para sua conta.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 py-4">
                                {/* Seleção de Chave PIX */}
                                <div className="space-y-2">
                                    <Label htmlFor="pixKey" className="text-right text-white">
                                        Chave PIX
                                    </Label>
                                    <div className="col-span-3">
                                        <Select value={selectedPixKeyIndex.toString()} onValueChange={(value) => setSelectedPixKeyIndex(parseInt(value))}>
                                            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {organization.pixKeys?.map((pixKey, index) => (
                                                    <SelectItem 
                                                        key={index} 
                                                        value={index.toString()} 
                                                        className="text-white hover:bg-zinc-700"
                                                        textValue={`${pixKey.key} - ${pixKey.keyType.toUpperCase()}`}
                                                    >
                                                        <div className="flex flex-row gap-2 items-center justify-center">
                                                            <span className="font-mono">{pixKey.key}</span>
                                                            {pixKey.description && (
                                                                <span className="text-xs text-zinc-400">{pixKey.description}</span>
                                                            )}
                                                            <span className="text-xs text-secondaryCustom">
                                                                {pixKey.keyType.toUpperCase()} {pixKey.isDefault && "(Padrão)"}
                                                            </span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* Seleção de Evento */}
                                <div className="space-y-2">
                                    <Label htmlFor="eventId" className="text-white">
                                        Associar ao Evento <span className="text-red-500">*</span>
                                    </Label>
                                    <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                                        <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                                            <SelectValue placeholder="Selecione um evento" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {organizationEvents?.map((event) => (
                                                <SelectItem key={event._id} value={event._id} className="text-white hover:bg-zinc-700">
                                                    {event.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Campo de Valor */}
                                <div className="space-y-2">
                                    <Label htmlFor="amount" className="text-white">
                                        Valor (R$)
                                    </Label>
                                    <Input
                                        id="amount"
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="R$ 0,00"
                                        value={withdrawalAmount}
                                        onChange={handleAmountChange}
                                        className="bg-zinc-800 border-zinc-700 text-white"
                                        maxLength={20}
                                    />
                                    <p className="text-xs text-green-600">
                                        Saldo Disponível: {selectedEventId ? formatCurrency(modalAvailableBalance) : "Selecione um evento"}
                                    </p>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsWithdrawalDialogOpen(false)}
                                    className="border-zinc-700 text-white hover:bg-zinc-800"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    type="button"
                                    onClick={handleWithdrawalRequest}
                                    className="bg-destaque text-white"
                                >
                                    Solicitar Saque
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Filtro por Evento */}
            <div className="mb-6">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                        <Label htmlFor="eventFilter" className="text-white mb-2 block">
                            Filtrar por Evento
                        </Label>
                        <Select value={filterEvent} onValueChange={setFilterEvent}>
                            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-white hover:bg-zinc-700">
                                    Todos os eventos
                                </SelectItem>
                                {organizationEvents?.map((event) => (
                                    <SelectItem key={event._id} value={event._id} className="text-white hover:bg-zinc-700">
                                        {event.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Alerta de Chargeback */}
            {transactionStats.chargebackCount > 0 && (
                <Card className="border border-yellow-600 bg-yellow-900/20 mb-6">
                    <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-yellow-500 mt-1" />
                            <div>
                                <p className="text-yellow-400 font-semibold">Transações em Disputa (Chargeback)</p>
                                <p className="text-[#A3A3A3] text-sm">
                                    Você possui {transactionStats.chargebackCount} transações contestadas pelo titular do cartão.
                                    Verifique os detalhes na lista de transações.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Alerta de saldo negativo */}
            {isNegativeBalance && (
                <Card className="border border-red-600 bg-red-900/20 mb-6">
                    <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-red-500 mt-1" />
                            <div>
                                <p className="text-red-400 font-semibold">Saldo negativo</p>
                                <p className="text-[#A3A3A3] text-sm">
                                    Você está devendo {formatCurrency(Math.abs(netAvailableBalance))}.
                                    Isso pode ocorrer por taxas de Venda Offline, reembolsos, estornos ou chargebacks em disputa.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Cards de Estatísticas Financeiras */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Card Cartão de Crédito */}
                <Card className="bg-zinc-900 border-zinc-700">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-white">Cartão de Crédito</CardTitle>
                        <CreditCard className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">{formatCurrency(transactionStats.cardAmount)}</div>
                        <p className="text-xs text-secondaryCustom">
                            {transactionStats.cardTransactions} transações
                        </p>
                        <div className="mt-2 text-xs space-y-1">
                            <div className="text-green-500">
                                Disponível: {formatCurrency(transactionStats.availableCardAmount)}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Card PIX */}
                <Card className="bg-zinc-900 border-zinc-700">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-white">PIX</CardTitle>
                        <BanknoteIcon className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">{formatCurrency(transactionStats.pixAmount)}</div>
                        <p className="text-xs text-secondaryCustom">
                            {transactionStats.pixTransactions} transações
                        </p>
                        <div className="mt-2 text-xs space-y-1">
                            <div className="text-green-500">
                                Disponível: {formatCurrency(transactionStats.availablePixAmount)}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Card Saldo Disponível */}
                <Card className="bg-zinc-900 border-zinc-700">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-white">Saldo Disponível</CardTitle>
                        <Building2 className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">{formatCurrency(availableBalance)}</div>
                        <p className="text-xs text-secondaryCustom">
                            Para saque
                        </p>
                        <div className="mt-2 text-xs">
                            <div className="text-red-500">
                                Já sacado: {formatCurrency(totalWithdrawn)}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Card Total de Transações */}
                <Card className="bg-zinc-900 border-zinc-700">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-white">Total de Faturamento</CardTitle>
                        <TrendingUp className="h-4 w-4 text-destaque" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-white">{formatCurrency(transactionStats.totalAmount)}</div>
                        <p className="text-xs text-secondaryCustom">
                            {transactionStats.total} transações <br />
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Abas de Transações e Saques */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full lg:w-fit grid-cols-2 bg-zinc-800 border-zinc-700">
                    <TabsTrigger value="transactions" className="text-white data-[state=active]:bg-destaque data-[state=active]:text-white">
                        Transações
                    </TabsTrigger>
                    <TabsTrigger value="withdrawals" className="text-white data-[state=active]:bg-destaque data-[state=active]:text-white">
                        Saques
                    </TabsTrigger>
                </TabsList>

                {/* Aba de Transações */}
                <TabsContent value="transactions" className="space-y-4">
                    <Card className="bg-zinc-900 border-zinc-700">
                        <CardHeader>
                            <CardTitle className="text-white">Transações</CardTitle>
                            <CardDescription className="text-secondaryCustom">
                                Visualize todas as transações da sua organização
                            </CardDescription>

                            {/* Filtros */}
                            <div className="flex flex-wrap gap-4 mt-4">
                                <div className="flex flex-col space-y-2">
                                    <Label htmlFor="payment-method-filter" className="text-white">Método de Pagamento</Label>
                                    <Select value={filterPaymentMethod} onValueChange={setFilterPaymentMethod}>
                                        <SelectTrigger className="w-[180px] bg-zinc-800 border-zinc-700 text-white">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all" className="text-white hover:bg-zinc-700">Todos</SelectItem>
                                            <SelectItem value="CARD" className="text-white hover:bg-zinc-700">Cartão</SelectItem>
                                            <SelectItem value="pix" className="text-white hover:bg-zinc-700">PIX</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex flex-col space-y-2">
                                    <Label htmlFor="status-filter" className="text-white">Status</Label>
                                    <Select value={filterStatus} onValueChange={setFilterStatus}>
                                        <SelectTrigger className="w-[180px] bg-zinc-800 border-zinc-700 text-white">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all" className="text-white hover:bg-zinc-700">Todos</SelectItem>
                                            <SelectItem value="paid" className="text-white hover:bg-zinc-700">Pago</SelectItem>
                                            <SelectItem value="pending" className="text-white hover:bg-zinc-700">Pendente</SelectItem>
                                            <SelectItem value="refunded" className="text-white hover:bg-zinc-700">Reembolsado</SelectItem>
                                            <SelectItem value="failed" className="text-white hover:bg-zinc-700">Falhou</SelectItem>
                                            <SelectItem value="canceled" className="text-white hover:bg-zinc-700">Cancelado</SelectItem>
                                            <SelectItem value="charged_back" className="text-white hover:bg-zinc-700">Chargeback</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="flex flex-col space-y-2">
                                    <Label htmlFor="event-filter" className="text-white">Evento</Label>
                                    <Select value={filterEvent} onValueChange={setFilterEvent}>
                                        <SelectTrigger className="w-[200px] bg-zinc-800 border-zinc-700 text-white">
                                            <SelectValue placeholder="Todos os eventos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all" className="text-white hover:bg-zinc-700">Todos os eventos</SelectItem>
                                            {organizationEvents?.map((event) => (
                                                <SelectItem key={event._id} value={event._id} className="text-white hover:bg-zinc-700">
                                                    {event.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {transactionsData && transactionsData.transactions.length > 0 ? (
                                <>
                                    <div className="rounded-md border border-zinc-700">
                                        <Table>
                                            <TableHeader className="bg-zinc-800">
                                                <TableRow className="border-zinc-700">
                                                    <TableHead className="text-secondaryCustom">Data</TableHead>
                                                    <TableHead className="text-secondaryCustom">Transação</TableHead>
                                                    <TableHead className="text-secondaryCustom">Evento</TableHead>
                                                    <TableHead className="text-secondaryCustom">Nome</TableHead>
                                                    <TableHead className="text-secondaryCustom">Valor Pago</TableHead>
                                                    <TableHead className="text-secondaryCustom">Método</TableHead>
                                                    <TableHead className="text-secondaryCustom">Status</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {isLoadingPage ? (
                                                    // Loading skeleton
                                                    Array.from({ length: itemsPerPage }).map((_, index) => (
                                                        <TableRow key={`loading-${index}`} className="border-zinc-700">
                                                            <TableCell className="text-white">
                                                                <div className="h-4 bg-zinc-700 rounded animate-pulse"></div>
                                                            </TableCell>
                                                            <TableCell className="text-white">
                                                                <div className="h-4 bg-zinc-700 rounded animate-pulse"></div>
                                                            </TableCell>
                                                            <TableCell className="text-white">
                                                                <div className="h-4 bg-zinc-700 rounded animate-pulse"></div>
                                                            </TableCell>
                                                            <TableCell className="text-white">
                                                                <div className="h-4 bg-zinc-700 rounded animate-pulse"></div>
                                                            </TableCell>
                                                            <TableCell className="text-white">
                                                                <div className="h-4 bg-zinc-700 rounded animate-pulse"></div>
                                                            </TableCell>
                                                            <TableCell className="text-white">
                                                                <div className="h-6 w-16 bg-zinc-700 rounded animate-pulse"></div>
                                                            </TableCell>
                                                            <TableCell className="text-white">
                                                                <div className="h-6 w-16 bg-zinc-700 rounded animate-pulse"></div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    transactionsData.transactions.map((transaction: any, index: Key) => {
                                                        const discountAmount = transaction.metadata?.discountAmount || 0;
                                                        const isOfflineAdjustment = transaction.paymentMethod === "OFFLINE_ADJUSTMENT";
                                                        const paymentMethod = isOfflineAdjustment ? "PIX" : (transaction.paymentMethod === "CARD" ? "CARD" : "PIX");

                                                        const eventFeeSettings = getEventFeeSettings(transaction.eventId);

                                                        const producerAmount = isOfflineAdjustment
                                                            ? transaction.amount
                                                            : feeCalculations.calculateProducerAmount(
                                                                transaction.metadata?.baseAmount || transaction.amount,
                                                                discountAmount,
                                                                paymentMethod,
                                                                eventFeeSettings,
                                                            );

                                                        const appliedFeePercentage = isOfflineAdjustment ? 0 : calculateAppliedFeePercentage(transaction.paymentMethod, eventFeeSettings);

                                                        const eventName = organizationEvents?.find(event => event._id === transaction.eventId)?.name || "Evento não encontrado";

                                                        return (
                                                            <TableRow key={index} className="border-zinc-700">
                                                                <TableCell className="text-white">{formatDate(transaction.createdAt)}</TableCell>
                                                                <TableCell className="font-mono text-xs text-white">
                                                                    <span title={transaction.transactionId}>
                                                                        {transaction.transactionId.length > 15 ? `${transaction.transactionId.slice(0, 15)}...` : transaction.transactionId}
                                                                    </span>
                                                                </TableCell>
                                                                <TableCell className="font-medium text-white">{eventName}</TableCell>
                                                                <TableCell className="font-medium text-white">
                                                                    <button
                                                                        onClick={() => openTransactionDetails(transaction)}
                                                                        className="text-destaque hover:underline transition-colors cursor-pointer"
                                                                    >
                                                                        {transaction.metadata?.customerName || (transaction.paymentMethod === "OFFLINE_ADJUSTMENT" ? (transaction.metadata?.type === "offline_fee" ? "Ajuste Offline" : "Ajuste Offline") : "")}
                                                                    </button>
                                                                </TableCell>
                                                                <TableCell className={`font-semibold ${transaction.paymentMethod === "OFFLINE_ADJUSTMENT" ? "text-red-500" : "text-green-600"}`}>
                                                                    {formatCurrency(producerAmount)}
                                                                </TableCell>
                                                                <TableCell>{getPaymentMethodBadge(transaction.paymentMethod)}</TableCell>
                                                                <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                                                            </TableRow>
                                                        );
                                                    })
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>

                                    {/* Controles de Paginação */}
                                    <div className="flex items-center justify-between mt-4">
                                        <div className="text-sm text-secondaryCustom">
                                            {isLoadingPage ? (
                                                <div className="h-4 w-48 bg-zinc-700 rounded animate-pulse"></div>
                                            ) : (
                                                `Mostrando ${Math.min(transactionsData.totalCount, (currentPage - 1) * itemsPerPage + 1)} a ${Math.min(transactionsData.totalCount, currentPage * itemsPerPage)} de ${transactionsData.totalCount} transações`
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handlePrevPage}
                                                disabled={currentPage === 1 || isLoadingPage}
                                                className="border-zinc-700 text-white hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                                            >
                                                <ChevronLeftIcon className="h-4 w-4" />
                                            </Button>
                                            <span className="text-white">
                                                {isLoadingPage ? (
                                                    <div className="h-4 w-16 bg-zinc-700 rounded animate-pulse"></div>
                                                ) : (
                                                    `Página ${currentPage}`
                                                )}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleNextPage}
                                                disabled={!transactionsData?.hasMore || isLoadingPage}
                                                className="border-zinc-700 text-white hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                                            >
                                                <ChevronRightIcon className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            ) : transactionsData && transactionsData.transactions.length === 0 ? (
                                <div className="text-center py-8 text-secondaryCustom">
                                    <CreditCard className="w-12 h-12 mx-auto mb-4 text-zinc-700" />
                                    <p>Nenhuma transação encontrada.</p>
                                    <p className="text-sm">Ajuste os filtros ou aguarde novas transações.</p>
                                </div>
                            ) : (
                                // Loading inicial
                                <div className="rounded-md border border-zinc-700">
                                    <Table>
                                        <TableHeader className="bg-zinc-800">
                                            <TableRow className="border-zinc-700">
                                                <TableHead className="text-secondaryCustom">Data</TableHead>
                                                <TableHead className="text-secondaryCustom">Transação</TableHead>
                                                <TableHead className="text-secondaryCustom">Evento</TableHead>
                                                <TableHead className="text-secondaryCustom">Nome</TableHead>
                                                <TableHead className="text-secondaryCustom">Valor Total</TableHead>
                                                <TableHead className="text-secondaryCustom">Valor Líquido</TableHead>
                                                <TableHead className="text-secondaryCustom">Método</TableHead>
                                                <TableHead className="text-secondaryCustom">Status</TableHead>
                                                <TableHead className="text-secondaryCustom">Taxa</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {Array.from({ length: itemsPerPage }).map((_, index) => (
                                                <TableRow key={`initial-loading-${index}`} className="border-zinc-700">
                                                    <TableCell className="text-white">
                                                        <div className="h-4 bg-zinc-700 rounded animate-pulse"></div>
                                                    </TableCell>
                                                    <TableCell className="text-white">
                                                        <div className="h-4 bg-zinc-700 rounded animate-pulse"></div>
                                                    </TableCell>
                                                    <TableCell className="text-white">
                                                        <div className="h-4 bg-zinc-700 rounded animate-pulse"></div>
                                                    </TableCell>
                                                    <TableCell className="text-white">
                                                        <div className="h-4 bg-zinc-700 rounded animate-pulse"></div>
                                                    </TableCell>
                                                    <TableCell className="text-white">
                                                        <div className="h-4 bg-zinc-700 rounded animate-pulse"></div>
                                                    </TableCell>
                                                    <TableCell className="text-white">
                                                        <div className="h-4 bg-zinc-700 rounded animate-pulse"></div>
                                                    </TableCell>
                                                    <TableCell className="text-white">
                                                        <div className="h-6 w-16 bg-zinc-700 rounded animate-pulse"></div>
                                                    </TableCell>
                                                    <TableCell className="text-white">
                                                        <div className="h-6 w-16 bg-zinc-700 rounded animate-pulse"></div>
                                                    </TableCell>
                                                    <TableCell className="text-white">
                                                        <div className="h-6 w-12 bg-zinc-700 rounded animate-pulse"></div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Aba de Saques */}
                <TabsContent value="withdrawals" className="space-y-4">
                    <Card className="bg-zinc-900 border-zinc-700">
                        <CardHeader>
                            <CardTitle className="text-white">Histórico de Saques</CardTitle>
                            <CardDescription className="text-secondaryCustom">
                                Visualize todas as solicitações de saque da sua organização
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border border-zinc-700">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-zinc-700">
                                            <TableHead className="text-white">Data</TableHead>
                                            <TableHead className="text-white">Valor</TableHead>
                                            <TableHead className="text-white">Chave PIX</TableHead>
                                            <TableHead className="text-white">Status</TableHead>
                                            <TableHead className="text-white">ID</TableHead>
                                            <TableHead className="text-white">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {withdrawals?.map((withdrawal: any) => (
                                            <TableRow key={withdrawal._id} className="border-zinc-700">
                                                <TableCell className="text-white">
                                                    {formatDate(withdrawal.requestedAt)}
                                                </TableCell>
                                                <TableCell className="text-white">
                                                    {formatCurrency(withdrawal.amount)}
                                                </TableCell>
                                                <TableCell className="text-white font-mono text-xs">
                                                    {withdrawal.pixKey?.key || "N/A"}
                                                </TableCell>
                                                <TableCell>
                                                    {getStatusBadge(withdrawal.status)}
                                                </TableCell>
                                                <TableCell className="text-white font-mono text-xs">
                                                    {withdrawal._id}
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openWithdrawalDetails(withdrawal)}
                                                        className="text-destaque hover:text-[#D24AEE] hover:bg-zinc-800"
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            {/* Mensagem quando não há saques */}
                            {withdrawals && withdrawals.length === 0 && (
                               <div className="text-center py-8 text-secondaryCustom">
                                    <ArrowDownIcon className="w-12 h-12 mx-auto mb-4 text-zinc-700" />
                                    <p>Nenhum saque solicitado.</p>
                                    <p className="text-sm">Quando você solicitar um saque, ele aparecerá aqui.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Sheet de Detalhes da Transação */}
            <Sheet open={isTransactionSheetOpen} onOpenChange={setIsTransactionSheetOpen}>
                <SheetContent className="bg-zinc-900 border-zinc-700 text-white w-full sm:w-[600px] sm:max-w-[600px] max-w-full overflow-hidden flex flex-col">
                    <SheetHeader className="flex-shrink-0">
                        <SheetTitle className="text-white flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Detalhes da Transação
                        </SheetTitle>
                    </SheetHeader>
                    
                    {selectedTransaction && (
                        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                            <div className="space-y-6 py-6">
                                {/* Informações do Cliente */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                        <User className="h-5 w-5" />
                                        Informações do Cliente
                                    </h3>
                                    <div className="grid grid-cols-1 gap-4 p-4 bg-zinc-800 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <User className="h-4 w-4 text-secondaryCustom flex-shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-secondaryCustom">Nome</p>
                                                <p className="text-white font-medium truncate">{selectedTransaction.metadata.customerName}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Mail className="h-4 w-4 text-secondaryCustom flex-shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-secondaryCustom">E-mail</p>
                                                <p className="text-white font-medium truncate">{selectedTransaction.metadata.customerEmail || "Não informado"}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Phone className="h-4 w-4 text-secondaryCustom flex-shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-secondaryCustom">Telefone</p>
                                                {selectedTransaction.metadata.customerPhone ? (
                                                    <div className="flex items-center gap-2">
                                                        <p className="text-white font-medium truncate">{selectedTransaction.metadata.customerPhone}</p>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                const link = createWhatsAppLink(selectedTransaction.metadata.customerPhone, selectedTransaction.metadata.customerName);
                                                                if (link) window.open(link, '_blank');
                                                            }}
                                                            className="text-green-500 hover:text-green-400 hover:bg-zinc-700 p-1 h-auto"
                                                            title="Abrir WhatsApp"
                                                        >
                                                            <MessageCircle className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <p className="text-white font-medium">Não informado</p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <FileText className="h-4 w-4 text-secondaryCustom flex-shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-secondaryCustom">CPF</p>
                                                <p className="text-white font-medium truncate">{selectedTransaction.metadata.customerCpf || "Não informado"}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <Separator className="bg-zinc-700" />

                                {/* Informações da Transação */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                                        <CreditCard className="h-5 w-5" />
                                        Detalhes da Transação
                                    </h3>
                                    <div className="grid grid-cols-1 gap-4 p-4 bg-zinc-800 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <Hash className="h-4 w-4 text-secondaryCustom flex-shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-secondaryCustom">ID da Transação</p>
                                                <p className="text-white font-mono text-sm truncate">{selectedTransaction.transactionId}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Calendar className="h-4 w-4 text-secondaryCustom flex-shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-secondaryCustom">Data da Transação</p>
                                                <p className="text-white font-medium">{formatDate(selectedTransaction.createdAt)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <MapPin className="h-4 w-4 text-secondaryCustom flex-shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-secondaryCustom">Evento</p>
                                                <p className="text-white font-medium truncate">{selectedTransaction.eventName}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <DollarSign className="h-4 w-4 text-secondaryCustom flex-shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-secondaryCustom">Valor Total</p>
                                                <p className="text-white font-semibold text-lg">
                                                    {formatCurrency(
                                                        selectedTransaction.paymentMethod === "OFFLINE_ADJUSTMENT" && selectedTransaction.metadata?.unitPrice
                                                            ? selectedTransaction.metadata.unitPrice * (selectedTransaction.metadata.quantity || 1)
                                                            : selectedTransaction.amount
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <TrendingUp className="h-4 w-4 text-secondaryCustom flex-shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-secondaryCustom">Valor Líquido</p>
                                                <p className={selectedTransaction.paymentMethod === "OFFLINE_ADJUSTMENT" ? "text-red-500 font-semibold text-lg" : "text-green-600 font-semibold text-lg"}>
                                                    {formatCurrency(
                                                    selectedTransaction.paymentMethod === "OFFLINE_ADJUSTMENT"
                                                        ? selectedTransaction.amount
                                                        : feeCalculations.calculateProducerAmount(
                                                            selectedTransaction.metadata?.baseAmount || selectedTransaction.amount,
                                                            selectedTransaction.metadata?.discountAmount || 0,
                                                            selectedTransaction.paymentMethod === "CARD" ? "CARD" : "PIX",
                                                            getEventFeeSettings(selectedTransaction.eventId),
                                                        )
                                                )}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                                <CreditCard className="h-4 w-4 text-secondaryCustom flex-shrink-0" />
                                                <div className="min-w-0">
                                                    <p className="text-sm text-secondaryCustom">Método de Pagamento</p>
                                                    <div className="mt-1">{getPaymentMethodBadge(selectedTransaction.paymentMethod)}</div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm text-secondaryCustom">Status</p>
                                                    <div className="mt-1">{getStatusBadge(selectedTransaction.status)}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Informações de Taxa */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-white">Taxa Aplicada</h3>
                                    <div className="p-4 bg-zinc-800 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <span className="text-secondaryCustom">Taxa de Processamento</span>
                                            <Badge variant="custom">
                                                {selectedTransaction.paymentMethod === "OFFLINE_ADJUSTMENT" ? 0 : calculateAppliedFeePercentage(selectedTransaction.paymentMethod, getEventFeeSettings(selectedTransaction.eventId))}%
                                            </Badge>
                                        </div>
                                    </div>
                                </div>

                                {/* Motivo da Recusa - Exibir apenas para transações recusadas */}
                                {selectedTransaction.status === "failed" && selectedTransaction.metadata?.providerResponse?.charges?.[0]?.last_transaction?.acquirer_message && (
                                    <div className="space-y-4">
                                        <Separator className="bg-zinc-700" />
                                        <div className="space-y-4">
                                            <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2">
                                                <AlertCircle className="h-5 w-5" />
                                                Motivo da Recusa
                                            </h3>
                                            <div className="p-4 bg-red-950/30 border border-red-800/50 rounded-lg">
                                                <div className="flex items-start gap-3">
                                                    <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-sm text-red-300 font-medium mb-2">
                                                            Mensagem do Processador:
                                                        </p>
                                                        <p className="text-red-100 leading-relaxed">
                                                            {selectedTransaction.metadata.providerResponse.charges[0].last_transaction.acquirer_message}
                                                        </p>
                                                        {selectedTransaction.metadata?.providerResponse?.charges?.[0]?.last_transaction?.acquirer_return_code && (
                                                            <div className="mt-3 pt-3 border-t border-red-800/30">
                                                                <p className="text-xs text-red-300">
                                                                    Código de retorno: {selectedTransaction.metadata.providerResponse.charges[0].last_transaction.acquirer_return_code}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>

            {/* Sheet de Detalhes do Saque */}
            <Sheet open={isWithdrawalSheetOpen} onOpenChange={setIsWithdrawalSheetOpen}>
                <SheetContent className="bg-zinc-900 border-zinc-700 text-white w-full sm:w-[600px] sm:max-w-[600px] max-w-full overflow-hidden flex flex-col">
                    <SheetHeader className="flex-shrink-0">
                        <SheetTitle className="text-white flex items-center gap-2">
                            {selectedWithdrawal && getStatusIcon(selectedWithdrawal.status)}
                            Detalhes do Saque
                        </SheetTitle>
                        <SheetDescription className="text-secondaryCustom">
                            Informações completas sobre a solicitação de saque
                        </SheetDescription>
                    </SheetHeader>

                    {selectedWithdrawal && (
                        <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                            <div className="space-y-6 py-6">
                                {/* Status e Valor */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-secondaryCustom text-sm">Status</Label>
                                        <div className="flex items-center gap-2">
                                            {getStatusBadge(selectedWithdrawal.status)}
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-secondaryCustom text-sm">Valor</Label>
                                        <p className="text-2xl font-bold text-destaque">
                                            {formatCurrency(selectedWithdrawal.amount)}
                                        </p>
                                    </div>
                                </div>

                                {/* Datas */}
                                <div className="grid grid-cols-1 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-secondaryCustom text-sm">Data da Solicitação</Label>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-secondaryCustom flex-shrink-0" />
                                            <p className="text-white">{formatDate(selectedWithdrawal.requestedAt)}</p>
                                        </div>
                                    </div>
                                    {selectedWithdrawal.processedAt && (
                                        <div className="space-y-2">
                                            <Label className="text-secondaryCustom text-sm">Data do Processamento</Label>
                                            <div className="flex items-center gap-2">
                                                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                                                <p className="text-white">{formatDate(selectedWithdrawal.processedAt)}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Chave PIX */}
                                <div className="space-y-4 p-4 bg-zinc-800 rounded-lg border border-zinc-700">
                                    <h3 className="text-white font-semibold flex items-center gap-2">
                                        <CreditCard className="h-4 w-4" />
                                        Chave PIX
                                    </h3>
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="space-y-2">
                                            <Label className="text-secondaryCustom text-sm">Tipo</Label>
                                            <p className="text-white">{formatPixKeyType(selectedWithdrawal.pixKey?.keyType)}</p>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-secondaryCustom text-sm">Chave</Label>
                                            <div className="flex items-center gap-2">
                                                <p className="text-white font-mono text-sm bg-zinc-700 px-3 py-2 rounded flex-1 truncate">
                                                    {selectedWithdrawal.pixKey?.key}
                                                </p>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => copyToClipboard(selectedWithdrawal.pixKey?.key, "Chave PIX")}
                                                    className="text-destaque hover:text-[#D24AEE] hover:bg-zinc-700 flex-shrink-0"
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        {selectedWithdrawal.pixKey?.description && (
                                            <div className="space-y-2">
                                                <Label className="text-secondaryCustom text-sm">Descrição</Label>
                                                <p className="text-white break-words">{selectedWithdrawal.pixKey.description}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Evento Associado */}
                                {selectedWithdrawal.eventId && (
                                    <div className="space-y-2">
                                        <Label className="text-secondaryCustom text-sm">Evento Associado</Label>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-secondaryCustom flex-shrink-0" />
                                            <p className="text-white truncate">{getEventName(selectedWithdrawal.eventId)}</p>
                                        </div>
                                    </div>
                                )}

                                {/* ID da Transação */}
                                {selectedWithdrawal.transactionId && (
                                    <div className="space-y-2">
                                        <Label className="text-secondaryCustom text-sm">ID da Transação</Label>
                                        <div className="flex items-center gap-2">
                                            <p className="text-white font-mono text-sm bg-zinc-800 px-3 py-2 rounded flex-1 truncate">
                                                {selectedWithdrawal.transactionId}
                                            </p>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => copyToClipboard(selectedWithdrawal.transactionId, "ID da Transação")}
                                                className="text-destaque hover:text-[#D24AEE] hover:bg-zinc-800 flex-shrink-0"
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Motivo de Falha */}
                                {selectedWithdrawal.failureReason && (
                                    <div className="space-y-2 p-4 bg-red-900/20 rounded-lg border border-red-700">
                                        <Label className="text-red-400 text-sm flex items-center gap-2">
                                            <XCircle className="h-4 w-4 flex-shrink-0" />
                                            Motivo da Falha
                                        </Label>
                                        <p className="text-red-300 break-words">{selectedWithdrawal.failureReason}</p>
                                    </div>
                                )}

                                {/* Notas */}
                                {selectedWithdrawal.notes && (
                                    <div className="space-y-2">
                                        <Label className="text-secondaryCustom text-sm">Notas</Label>
                                        <p className="text-white bg-zinc-800 p-3 rounded-lg break-words">{selectedWithdrawal.notes}</p>
                                    </div>
                                )}

                                {/* Comprovante */}
                                {selectedWithdrawal.receiptStorageId && (
                                    <div className="space-y-2">
                                        <Label className="text-secondaryCustom text-sm">Comprovante</Label>
                                        <Button
                                            onClick={() => downloadReceipt(selectedWithdrawal.receiptStorageId)}
                                            className="bg-destaque hover:bg-[#D24AEE] text-white w-full"
                                        >
                                            <Download className="h-4 w-4 mr-2" />
                                            Baixar Comprovante
                                        </Button>
                                    </div>
                                )}

                                {/* ID do Saque */}
                                <div className="space-y-2 pt-4 border-t border-zinc-700">
                                    <Label className="text-secondaryCustom text-sm">ID do Saque</Label>
                                    <div className="flex items-center gap-2">
                                        <p className="text-white font-mono text-sm bg-zinc-800 px-3 py-2 rounded flex-1 truncate">
                                            {selectedWithdrawal._id}
                                        </p>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => copyToClipboard(selectedWithdrawal._id, "ID do Saque")}
                                            className="text-destaque hover:text-[#D24AEE] hover:bg-zinc-800 flex-shrink-0"
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}