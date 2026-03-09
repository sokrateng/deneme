import React, { useState, useEffect } from 'react';
import { Plus, Wallet, TrendingUp, TrendingDown, Users as UsersIcon, Settings, Trash2, Edit2, ChevronLeft, ChevronRight, Loader2, LogOut, Target, CheckCircle2 } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from './supabaseClient';
import Login from './Login';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#ff7300'];

function App() {
    // --- AUTH STATE ---
    const [session, setSession] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    // --- STATE ---
    const [users, setUsers] = useState([]);
    const [categories, setCategories] = useState({ income: [], expense: [] });
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // UI State
    const [activeTab, setActiveTab] = useState('dashboard');
    const [editingTransaction, setEditingTransaction] = useState(null);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [dashboardUserFilter, setDashboardUserFilter] = useState([]);
    const [dashboardEntryTypeFilter, setDashboardEntryTypeFilter] = useState('all'); // 'all', 'actual', 'estimated'
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    // Form State
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState('expense');
    const [entryType, setEntryType] = useState('actual'); // 'actual' or 'estimated'
    const [selectedUser, setSelectedUser] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    // Settings Form State
    const [editingUser, setEditingUser] = useState(null);
    const [userForm, setUserForm] = useState({ name: '', phone: '' });
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryForm, setCategoryForm] = useState({ name: '', type: 'expense' });

    // --- SUPABASE FETCH FUNCTIONS ---
    const fetchUsers = async () => {
        const { data, error } = await supabase.from('users').select('*').order('created_at');
        if (error) console.error('Error fetching users:', error);
        else setUsers(data || []);
    };

    const fetchCategories = async () => {
        const { data, error } = await supabase.from('categories').select('*').order('created_at');
        if (error) console.error('Error fetching categories:', error);
        else {
            const income = data?.filter(c => c.type === 'income') || [];
            const expense = data?.filter(c => c.type === 'expense') || [];
            setCategories({ income, expense });
        }
    };

    const fetchTransactions = async () => {
        const { data, error } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
        if (error) console.error('Error fetching transactions:', error);
        else setTransactions(data || []);
    };

    // --- AUTH CHECK ---
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setAuthLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    // Initial data load
    useEffect(() => {
        if (session) {
            const loadData = async () => {
                setLoading(true);
                await Promise.all([fetchUsers(), fetchCategories(), fetchTransactions()]);
                setLoading(false);
            };
            loadData();
        }
    }, [session]);

    // Logout handler
    const handleLogout = async () => {
        await supabase.auth.signOut();
        setSession(null);
        setUsers([]);
        setCategories({ income: [], expense: [] });
        setTransactions([]);
    };

    // Set default selected user when users load
    useEffect(() => {
        if (users.length > 0 && !selectedUser) {
            setSelectedUser(users[0].id);
        }
    }, [users]);

    // --- HANDLERS: Transactions ---
    const handleAddTransaction = async (e) => {
        e.preventDefault();
        if (!amount || !description || !selectedUser || !selectedCategory) return;

        if (editingTransaction) {
            const { error } = await supabase
                .from('transactions')
                .update({
                    user_id: selectedUser,
                    type,
                    entry_type: entryType,
                    amount: parseFloat(amount),
                    description,
                    category: selectedCategory,
                    date,
                })
                .eq('id', editingTransaction.id);

            if (error) console.error('Error updating transaction:', error);
            else {
                await fetchTransactions();
                setEditingTransaction(null);
            }
        } else {
            const { error } = await supabase.from('transactions').insert([{
                user_id: selectedUser,
                type,
                entry_type: entryType,
                amount: parseFloat(amount),
                description,
                category: selectedCategory,
                date,
                auth_user_id: session.user.id
            }]);

            if (error) console.error('Error adding transaction:', error);
            else await fetchTransactions();
        }

        setAmount('');
        setDescription('');
        setEntryType('actual');
    };

    const handleEditTransactionClick = (t) => {
        setEditingTransaction(t);
        setAmount(t.amount);
        setDescription(t.description);
        setType(t.type);
        setEntryType(t.entry_type || 'actual');
        setSelectedUser(t.user_id);
        setSelectedCategory(t.category);
        setDate(t.date);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingTransaction(null);
        setAmount('');
        setDescription('');
        setEntryType('actual');
        setDate(new Date().toISOString().split('T')[0]);
    };

    const handleDeleteTransaction = async (id) => {
        if (confirm('Bu işlemi silmek istediğinize emin misiniz?')) {
            const { error } = await supabase.from('transactions').delete().eq('id', id);
            if (error) console.error('Error deleting transaction:', error);
            else await fetchTransactions();
        }
    };

    // Mark estimated transaction as actual
    const handleMarkAsActual = async (t) => {
        const { error } = await supabase
            .from('transactions')
            .update({ entry_type: 'actual' })
            .eq('id', t.id);

        if (error) console.error('Error updating transaction:', error);
        else await fetchTransactions();
    };

    // --- HANDLERS: Users ---
    const handleSaveUser = async (e) => {
        e.preventDefault();
        if (!userForm.name) return;

        const avatar = `https://ui-avatars.com/api/?name=${userForm.name}&background=random`;

        if (editingUser) {
            const { error } = await supabase
                .from('users')
                .update({ name: userForm.name, phone: userForm.phone, avatar })
                .eq('id', editingUser.id);

            if (error) console.error('Error updating user:', error);
            else {
                await fetchUsers();
                setEditingUser(null);
            }
        } else {
            const { error } = await supabase.from('users').insert([{
                name: userForm.name,
                phone: userForm.phone,
                avatar,
                auth_user_id: session.user.id
            }]);

            if (error) console.error('Error adding user:', error);
            else await fetchUsers();
        }

        setUserForm({ name: '', phone: '' });
    };

    const handleEditUserClick = (user) => {
        setEditingUser(user);
        setUserForm({ name: user.name, phone: user.phone });
    };

    const handleDeleteUser = async (id) => {
        if (confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) {
            const { error } = await supabase.from('users').delete().eq('id', id);
            if (error) console.error('Error deleting user:', error);
            else await fetchUsers();
        }
    };

    // --- HANDLERS: Categories ---
    const handleSaveCategory = async (e) => {
        e.preventDefault();
        if (!categoryForm.name) return;

        if (editingCategory) {
            const { error } = await supabase
                .from('categories')
                .update({ name: categoryForm.name, type: categoryForm.type })
                .eq('id', editingCategory.id);

            if (error) console.error('Error updating category:', error);
            else {
                await fetchCategories();
                setEditingCategory(null);
            }
        } else {
            const { error } = await supabase.from('categories').insert([{
                name: categoryForm.name,
                type: categoryForm.type,
                auth_user_id: session.user.id
            }]);

            if (error) console.error('Error adding category:', error);
            else await fetchCategories();
        }

        setCategoryForm(prev => ({ ...prev, name: '' }));
    };

    const handleEditCategoryClick = (cat, type) => {
        setEditingCategory({ ...cat, type });
        setCategoryForm({ name: cat.name, type });
    };

    const handleDeleteCategory = async (catType, id) => {
        if (confirm('Bu kategoriyi silmek istediğinize emin misiniz?')) {
            const { error } = await supabase.from('categories').delete().eq('id', id);
            if (error) console.error('Error deleting category:', error);
            else await fetchCategories();
        }
    };

    // --- CALCULATIONS & FILTERING ---
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);

    const filteredTransactions = transactions.filter(t =>
        isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd }) &&
        (dashboardUserFilter.length === 0 || dashboardUserFilter.includes(t.user_id)) &&
        (dashboardEntryTypeFilter === 'all' || (t.entry_type || 'actual') === dashboardEntryTypeFilter)
    );

    const sortedTransactions = [...filteredTransactions].sort((a, b) => {
        if (sortConfig.key === 'amount') {
            return sortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
        }
        if (sortConfig.key === 'date') {
            return sortConfig.direction === 'asc' ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date);
        }
        if (sortConfig.key === 'user_id') {
            const nameA = users.find(u => u.id === a.user_id)?.name || '';
            const nameB = users.find(u => u.id === b.user_id)?.name || '';
            return sortConfig.direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        }
        const valA = a[sortConfig.key] ? a[sortConfig.key].toString().toLowerCase() : '';
        const valB = b[sortConfig.key] ? b[sortConfig.key].toString().toLowerCase() : '';
        return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    // All transactions for the month (ignoring entry_type filter, for summary cards)
    const allMonthTransactions = transactions.filter(t =>
        isWithinInterval(parseISO(t.date), { start: monthStart, end: monthEnd }) &&
        (dashboardUserFilter.length === 0 || dashboardUserFilter.includes(t.user_id))
    );

    const actualTransactions = allMonthTransactions.filter(t => (t.entry_type || 'actual') === 'actual');
    const estimatedTransactions = allMonthTransactions.filter(t => (t.entry_type || 'actual') === 'estimated');

    const totalIncomeActual = actualTransactions.filter(t => t.type === 'income').reduce((acc, c) => acc + c.amount, 0);
    const totalExpenseActual = actualTransactions.filter(t => t.type === 'expense').reduce((acc, c) => acc + c.amount, 0);
    const totalIncomeEstimated = estimatedTransactions.filter(t => t.type === 'income').reduce((acc, c) => acc + c.amount, 0);
    const totalExpenseEstimated = estimatedTransactions.filter(t => t.type === 'expense').reduce((acc, c) => acc + c.amount, 0);

    const totalIncome = totalIncomeActual + totalIncomeEstimated;
    const totalExpense = totalExpenseActual + totalExpenseEstimated;
    const balance = totalIncome - totalExpense;
    const balanceActual = totalIncomeActual - totalExpenseActual;

    const userStats = users.map(user => {
        const userTrans = allMonthTransactions.filter(t => t.user_id === user.id);
        const income = userTrans.filter(t => t.type === 'income').reduce((acc, c) => acc + c.amount, 0);
        const expense = userTrans.filter(t => t.type === 'expense').reduce((acc, c) => acc + c.amount, 0);
        const incomeEst = userTrans.filter(t => t.type === 'income' && (t.entry_type || 'actual') === 'estimated').reduce((acc, c) => acc + c.amount, 0);
        const expenseEst = userTrans.filter(t => t.type === 'expense' && (t.entry_type || 'actual') === 'estimated').reduce((acc, c) => acc + c.amount, 0);
        return { ...user, income, expense, balance: income - expense, incomeEst, expenseEst };
    });

    // Chart Data: Monthly Comparison with estimated vs actual
    const monthlyComparisonData = [];
    for (let i = 3; i >= 0; i--) {
        const targetDate = subMonths(currentDate, i);
        const start = startOfMonth(targetDate);
        const end = endOfMonth(targetDate);

        const monthTrans = transactions.filter(t =>
            isWithinInterval(parseISO(t.date), { start, end }) &&
            (dashboardUserFilter.length === 0 || dashboardUserFilter.includes(t.user_id))
        );

        const incomeActual = monthTrans.filter(t => t.type === 'income' && (t.entry_type || 'actual') === 'actual').reduce((acc, c) => acc + c.amount, 0);
        const expenseActual = monthTrans.filter(t => t.type === 'expense' && (t.entry_type || 'actual') === 'actual').reduce((acc, c) => acc + c.amount, 0);
        const incomeEstimated = monthTrans.filter(t => t.type === 'income' && (t.entry_type || 'actual') === 'estimated').reduce((acc, c) => acc + c.amount, 0);
        const expenseEstimated = monthTrans.filter(t => t.type === 'expense' && (t.entry_type || 'actual') === 'estimated').reduce((acc, c) => acc + c.amount, 0);

        monthlyComparisonData.push({
            name: format(targetDate, 'MMMM', { locale: tr }),
            'Gelir (Gerçek)': incomeActual,
            'Gider (Gerçek)': expenseActual,
            'Gelir (Tahmini)': incomeEstimated,
            'Gider (Tahmini)': expenseEstimated,
        });
    }

    // Chart Data: Category Pie Charts
    const getCategoryData = (transType) => {
        const data = filteredTransactions
            .filter(t => t.type === transType)
            .reduce((acc, t) => {
                const label = (t.entry_type || 'actual') === 'estimated' ? `${t.category} (T)` : t.category;
                acc[label] = (acc[label] || 0) + t.amount;
                return acc;
            }, {});
        return Object.entries(data).map(([name, value]) => ({ name, value }));
    };

    const incomeCategoryData = getCategoryData('income');
    const expenseCategoryData = getCategoryData('expense');

    // Auth loading
    if (authLoading) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600">Yükleniyor...</p>
                </div>
            </div>
        );
    }

    // Not logged in
    if (!session) {
        return <Login onLogin={(user) => setSession({ user })} />;
    }

    // Data loading
    if (loading) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
                    <p className="text-gray-600">Veriler yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans text-gray-800">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header */}
                <header className="flex flex-col md:flex-row items-center justify-between bg-white p-6 rounded-2xl shadow-sm gap-4">
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <div className="bg-blue-600 p-3 rounded-xl text-white">
                            <Wallet size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Aile Bütçesi</h1>
                            <p className="text-gray-500 text-sm">Harcamalarınızı kontrol altına alın</p>
                        </div>
                    </div>

                    {activeTab === 'dashboard' && (
                        <div className="flex items-center bg-gray-100 rounded-lg p-1">
                            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-2 hover:bg-white rounded-md transition-all"><ChevronLeft size={20} /></button>
                            <span className="px-4 font-medium min-w-[140px] text-center">{format(currentDate, 'MMMM yyyy', { locale: tr })}</span>
                            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-2 hover:bg-white rounded-md transition-all"><ChevronRight size={20} /></button>
                        </div>
                    )}

                    <div className="flex items-center gap-4 w-full md:w-auto justify-end">
                        <button
                            onClick={() => setActiveTab(activeTab === 'dashboard' ? 'settings' : 'dashboard')}
                            className={`p-2 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100'}`}
                        >
                            <Settings size={24} />
                        </button>
                        <button
                            onClick={handleLogout}
                            className="p-2 rounded-lg text-gray-500 hover:bg-red-100 hover:text-red-600 transition-colors"
                            title="Çıkış Yap"
                        >
                            <LogOut size={24} />
                        </button>
                        <div className="text-right hidden sm:block">
                            <p className="text-sm text-gray-500">Toplam Bakiye</p>
                            <p className={`text-2xl font-bold ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {balance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                            </p>
                            {(totalIncomeEstimated > 0 || totalExpenseEstimated > 0) && (
                                <p className="text-xs text-gray-400">
                                    Gerçekleşen: {balanceActual.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                                </p>
                            )}
                        </div>
                    </div>
                </header>

                {activeTab === 'dashboard' ? (
                    <>
                        {/* User Filter */}
                        <div className="flex flex-wrap items-center gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
                            <button
                                onClick={() => setDashboardUserFilter([])}
                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${dashboardUserFilter.length === 0 ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'}`}
                            >
                                Tümü
                            </button>
                            {users.map(user => (
                                <button
                                    key={user.id}
                                    onClick={() => {
                                        if (dashboardUserFilter.includes(user.id)) {
                                            const newFilter = dashboardUserFilter.filter(id => id !== user.id);
                                            setDashboardUserFilter(newFilter);
                                        } else {
                                            setDashboardUserFilter([...dashboardUserFilter, user.id]);
                                        }
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${dashboardUserFilter.includes(user.id) ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'}`}
                                >
                                    <img src={user.avatar} className="w-5 h-5 rounded-full" alt="" />
                                    {user.name}
                                </button>
                            ))}

                            {/* Entry Type Filter */}
                            <div className="ml-auto flex items-center gap-1 bg-white rounded-full shadow-sm p-1">
                                <button
                                    onClick={() => setDashboardEntryTypeFilter('all')}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${dashboardEntryTypeFilter === 'all' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Tümü
                                </button>
                                <button
                                    onClick={() => setDashboardEntryTypeFilter('actual')}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${dashboardEntryTypeFilter === 'actual' ? 'bg-emerald-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <CheckCircle2 size={12} /> Gerçekleşen
                                </button>
                                <button
                                    onClick={() => setDashboardEntryTypeFilter('estimated')}
                                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${dashboardEntryTypeFilter === 'estimated' ? 'bg-amber-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <Target size={12} /> Tahmini
                                </button>
                            </div>
                        </div>

                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white p-6 rounded-2xl shadow-sm flex items-center gap-4">
                                <div className="bg-green-100 p-3 rounded-full text-green-600"><TrendingUp size={24} /></div>
                                <div>
                                    <p className="text-sm text-gray-500">Dönem Geliri</p>
                                    <p className="text-2xl font-bold text-green-600">{totalIncome.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</p>
                                    {totalIncomeEstimated > 0 && (
                                        <div className="flex gap-2 text-xs mt-1">
                                            <span className="text-emerald-600">{totalIncomeActual.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} gerçek</span>
                                            <span className="text-amber-500">{totalIncomeEstimated.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} tahmini</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm flex items-center gap-4">
                                <div className="bg-red-100 p-3 rounded-full text-red-600"><TrendingDown size={24} /></div>
                                <div>
                                    <p className="text-sm text-gray-500">Dönem Gideri</p>
                                    <p className="text-2xl font-bold text-red-600">{totalExpense.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</p>
                                    {totalExpenseEstimated > 0 && (
                                        <div className="flex gap-2 text-xs mt-1">
                                            <span className="text-emerald-600">{totalExpenseActual.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} gerçek</span>
                                            <span className="text-amber-500">{totalExpenseEstimated.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} tahmini</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm flex items-center gap-4">
                                <div className="bg-amber-100 p-3 rounded-full text-amber-600"><Target size={24} /></div>
                                <div>
                                    <p className="text-sm text-gray-500">Tahmini Kalemler</p>
                                    <p className="text-2xl font-bold text-amber-600">{estimatedTransactions.length}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Net etki: {(totalIncomeEstimated - totalExpenseEstimated).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                                    </p>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm flex items-center gap-4">
                                <div className="bg-blue-100 p-3 rounded-full text-blue-600"><UsersIcon size={24} /></div>
                                <div>
                                    <p className="text-sm text-gray-500">Kişi Sayısı</p>
                                    <p className="text-2xl font-bold text-blue-600">{users.length}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left Column */}
                            <div className="space-y-6 lg:col-span-1">
                                {/* Add Transaction Form */}
                                <div className="bg-white p-6 rounded-2xl shadow-sm">
                                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                                        {editingTransaction ? <Edit2 size={20} /> : <Plus size={20} />}
                                        {editingTransaction ? 'İşlem Düzenle' : 'İşlem Ekle'}
                                    </h2>
                                    <form onSubmit={handleAddTransaction} className="space-y-4">
                                        <div className="flex bg-gray-100 p-1 rounded-lg">
                                            <button type="button" onClick={() => setType('income')} className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${type === 'income' ? 'bg-green-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Gelir</button>
                                            <button type="button" onClick={() => setType('expense')} className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${type === 'expense' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Gider</button>
                                        </div>

                                        {/* Entry Type Toggle: Gerçekleşen / Tahmini */}
                                        <div className="flex bg-gray-100 p-1 rounded-lg">
                                            <button type="button" onClick={() => setEntryType('actual')} className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1 ${entryType === 'actual' ? 'bg-emerald-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                                <CheckCircle2 size={14} /> Gerçekleşen
                                            </button>
                                            <button type="button" onClick={() => setEntryType('estimated')} className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-1 ${entryType === 'estimated' ? 'bg-amber-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                                                <Target size={14} /> Tahmini
                                            </button>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Kişi</label>
                                            <select value={selectedUser} onChange={(e) => setSelectedUser(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
                                                {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
                                            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required>
                                                <option value="">Seçiniz</option>
                                                {categories[type].map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Tutar (TL)</label>
                                            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Açıklama</label>
                                            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Açıklama giriniz" className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Tarih</label>
                                            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" required />
                                        </div>

                                        <div className="flex gap-2">
                                            {editingTransaction && (
                                                <button type="button" onClick={handleCancelEdit} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors">İptal</button>
                                            )}
                                            <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                                                {editingTransaction ? 'Güncelle' : 'Ekle'}
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                {/* User Summaries */}
                                <div className="bg-white p-6 rounded-2xl shadow-sm">
                                    <h2 className="text-lg font-bold mb-4">Kişi Bazlı Durum (Bu Ay)</h2>
                                    <div className="space-y-4">
                                        {userStats.map(user => (
                                            <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                                <div className="flex items-center gap-3">
                                                    <img src={user.avatar} alt={user.name} className="w-10 h-10 rounded-full" />
                                                    <div>
                                                        <p className="font-medium text-gray-900">{user.name}</p>
                                                        <p className="text-xs text-gray-500">
                                                            <span className="text-green-600">+{user.income.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span> | <span className="text-red-600">-{user.expense.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}</span>
                                                        </p>
                                                        {(user.incomeEst > 0 || user.expenseEst > 0) && (
                                                            <p className="text-xs text-amber-500">
                                                                Tahmini: +{user.incomeEst.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} / -{user.expenseEst.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className={`font-bold ${user.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {user.balance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Right Column */}
                            <div className="space-y-6 lg:col-span-2">

                                {/* Charts Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Income Pie */}
                                    <div className="bg-white p-6 rounded-2xl shadow-sm">
                                        <h2 className="text-sm font-bold mb-4 text-gray-500 uppercase tracking-wider">Gelir Dağılımı</h2>
                                        <div className="h-48 w-full">
                                            {incomeCategoryData.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie data={incomeCategoryData} cx="50%" cy="50%" innerRadius={30} outerRadius={60} paddingAngle={5} dataKey="value">
                                                            {incomeCategoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                                        </Pie>
                                                        <Tooltip formatter={(value) => value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} />
                                                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">Veri yok</div>}
                                        </div>
                                    </div>

                                    {/* Expense Pie */}
                                    <div className="bg-white p-6 rounded-2xl shadow-sm">
                                        <h2 className="text-sm font-bold mb-4 text-gray-500 uppercase tracking-wider">Gider Dağılımı</h2>
                                        <div className="h-48 w-full">
                                            {expenseCategoryData.length > 0 ? (
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie data={expenseCategoryData} cx="50%" cy="50%" innerRadius={30} outerRadius={60} paddingAngle={5} dataKey="value">
                                                            {expenseCategoryData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                                        </Pie>
                                                        <Tooltip formatter={(value) => value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} />
                                                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                                                    </PieChart>
                                                </ResponsiveContainer>
                                            ) : <div className="h-full flex items-center justify-center text-gray-400 text-sm">Veri yok</div>}
                                        </div>
                                    </div>
                                </div>

                                {/* Bar Chart - Updated with estimated vs actual */}
                                <div className="bg-white p-6 rounded-2xl shadow-sm">
                                    <h2 className="text-lg font-bold mb-4">Aylık Karşılaştırma (Son 4 Dönem)</h2>
                                    <div className="h-72 w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={monthlyComparisonData}>
                                                <XAxis dataKey="name" />
                                                <YAxis tickFormatter={(value) => value.toLocaleString('tr-TR')} />
                                                <Tooltip formatter={(value) => value.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} />
                                                <Legend />
                                                <Bar dataKey="Gelir (Gerçek)" fill="#10B981" radius={[4, 4, 0, 0]} stackId="income" />
                                                <Bar dataKey="Gelir (Tahmini)" fill="#10B98166" radius={[4, 4, 0, 0]} stackId="income" />
                                                <Bar dataKey="Gider (Gerçek)" fill="#EF4444" radius={[4, 4, 0, 0]} stackId="expense" />
                                                <Bar dataKey="Gider (Tahmini)" fill="#EF444466" radius={[4, 4, 0, 0]} stackId="expense" />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Recent Transactions */}
                                <div className="bg-white p-6 rounded-2xl shadow-sm">
                                    <h2 className="text-lg font-bold mb-4">Bu Ayın İşlemleri</h2>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="border-b border-gray-100 text-gray-500 text-sm">
                                                    <th className="pb-3 font-medium cursor-pointer hover:text-gray-700" onClick={() => setSortConfig({ key: 'user_id', direction: sortConfig.key === 'user_id' && sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>
                                                        Kişi {sortConfig.key === 'user_id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                                    </th>
                                                    <th className="pb-3 font-medium cursor-pointer hover:text-gray-700" onClick={() => setSortConfig({ key: 'category', direction: sortConfig.key === 'category' && sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>
                                                        Kategori {sortConfig.key === 'category' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                                    </th>
                                                    <th className="pb-3 font-medium cursor-pointer hover:text-gray-700" onClick={() => setSortConfig({ key: 'description', direction: sortConfig.key === 'description' && sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>
                                                        Açıklama {sortConfig.key === 'description' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                                    </th>
                                                    <th className="pb-3 font-medium">Tip</th>
                                                    <th className="pb-3 font-medium cursor-pointer hover:text-gray-700" onClick={() => setSortConfig({ key: 'date', direction: sortConfig.key === 'date' && sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>
                                                        Tarih {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                                    </th>
                                                    <th className="pb-3 font-medium text-right cursor-pointer hover:text-gray-700" onClick={() => setSortConfig({ key: 'amount', direction: sortConfig.key === 'amount' && sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>
                                                        Tutar {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                                                    </th>
                                                    <th className="pb-3 font-medium w-24"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-sm">
                                                {sortedTransactions.length === 0 ? (
                                                    <tr><td colSpan="7" className="py-8 text-center text-gray-400">Bu dönemde işlem yok</td></tr>
                                                ) : (
                                                    sortedTransactions.map(t => {
                                                        const user = users.find(u => u.id === t.user_id);
                                                        const isEstimated = (t.entry_type || 'actual') === 'estimated';
                                                        return (
                                                            <tr key={t.id} className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors group ${isEstimated ? 'bg-amber-50/50' : ''}`}>
                                                                <td className="py-3 flex items-center gap-2">
                                                                    <img src={user?.avatar} className="w-6 h-6 rounded-full" alt="" />
                                                                    <span className="text-gray-900">{user?.name}</span>
                                                                </td>
                                                                <td className="py-3 text-gray-600"><span className="bg-gray-100 px-2 py-1 rounded text-xs">{t.category}</span></td>
                                                                <td className="py-3 text-gray-600">{t.description}</td>
                                                                <td className="py-3">
                                                                    {isEstimated ? (
                                                                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-medium">
                                                                            <Target size={10} /> Tahmini
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-medium">
                                                                            <CheckCircle2 size={10} /> Gerçek
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className="py-3 text-gray-500">{format(parseISO(t.date), 'd MMM', { locale: tr })}</td>
                                                                <td className={`py-3 text-right font-medium ${t.type === 'income' ? 'text-green-600' : 'text-red-600'} ${isEstimated ? 'opacity-70' : ''}`}>
                                                                    {t.type === 'income' ? '+' : '-'}{t.amount.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}
                                                                </td>
                                                                <td className="py-3 text-right">
                                                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        {isEstimated && (
                                                                            <button
                                                                                onClick={() => handleMarkAsActual(t)}
                                                                                className="p-1 text-emerald-500 hover:bg-emerald-100 rounded"
                                                                                title="Gerçekleşti olarak işaretle"
                                                                            >
                                                                                <CheckCircle2 size={16} />
                                                                            </button>
                                                                        )}
                                                                        <button onClick={() => handleEditTransactionClick(t)} className="p-1 text-blue-500 hover:bg-blue-100 rounded"><Edit2 size={16} /></button>
                                                                        <button onClick={() => handleDeleteTransaction(t.id)} className="p-1 text-red-500 hover:bg-red-100 rounded"><Trash2 size={16} /></button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    // SETTINGS TAB
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* User Management */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm">
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><UsersIcon size={20} /> Kullanıcı Yönetimi</h2>
                            <form onSubmit={handleSaveUser} className="mb-6 space-y-3 bg-gray-50 p-4 rounded-xl">
                                <div className="grid grid-cols-2 gap-3">
                                    <input type="text" placeholder="İsim" value={userForm.name} onChange={e => setUserForm({ ...userForm, name: e.target.value })} className="p-2 border rounded-lg" required />
                                    <input type="text" placeholder="Telefon" value={userForm.phone} onChange={e => setUserForm({ ...userForm, phone: e.target.value })} className="p-2 border rounded-lg" />
                                </div>
                                <div className="flex gap-2">
                                    {editingUser && <button type="button" onClick={() => { setEditingUser(null); setUserForm({ name: '', phone: '' }); }} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">İptal</button>}
                                    <button type="submit" className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">{editingUser ? 'Güncelle' : 'Kullanıcı Ekle'}</button>
                                </div>
                            </form>
                            <div className="space-y-2">
                                {users.map(user => (
                                    <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl group">
                                        <div className="flex items-center gap-3">
                                            <img src={user.avatar} className="w-8 h-8 rounded-full" alt="" />
                                            <div>
                                                <p className="font-medium">{user.name}</p>
                                                <p className="text-xs text-gray-500">{user.phone || 'Tel yok'}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleEditUserClick(user)} className="p-1 text-blue-500 hover:bg-blue-100 rounded"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDeleteUser(user.id)} className="p-1 text-red-500 hover:bg-red-100 rounded"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Category Management */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm">
                            <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Settings size={20} /> Kategori Yönetimi</h2>
                            <form onSubmit={handleSaveCategory} className="mb-6 space-y-3 bg-gray-50 p-4 rounded-xl">
                                <div className="flex gap-2">
                                    <select value={categoryForm.type} onChange={e => setCategoryForm({ ...categoryForm, type: e.target.value })} className="p-2 border rounded-lg">
                                        <option value="income">Gelir</option>
                                        <option value="expense">Gider</option>
                                    </select>
                                    <input type="text" placeholder="Kategori Adı" value={categoryForm.name} onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} className="flex-1 p-2 border rounded-lg" required />
                                </div>
                                <div className="flex gap-2">
                                    {editingCategory && <button type="button" onClick={() => { setEditingCategory(null); setCategoryForm({ name: '', type: 'expense' }); }} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300">İptal</button>}
                                    <button type="submit" className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700">{editingCategory ? 'Güncelle' : 'Kategori Ekle'}</button>
                                </div>
                            </form>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h3 className="font-medium text-green-600 mb-2">Gelir Kategorileri</h3>
                                    <div className="space-y-2">
                                        {categories.income.map(cat => (
                                            <div key={cat.id} className="flex justify-between items-center p-2 bg-green-50 rounded-lg text-sm group">
                                                <span>{cat.name}</span>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEditCategoryClick(cat, 'income')} className="text-blue-400 hover:text-blue-600"><Edit2 size={14} /></button>
                                                    <button onClick={() => handleDeleteCategory('income', cat.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h3 className="font-medium text-red-600 mb-2">Gider Kategorileri</h3>
                                    <div className="space-y-2">
                                        {categories.expense.map(cat => (
                                            <div key={cat.id} className="flex justify-between items-center p-2 bg-red-50 rounded-lg text-sm group">
                                                <span>{cat.name}</span>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => handleEditCategoryClick(cat, 'expense')} className="text-blue-400 hover:text-blue-600"><Edit2 size={14} /></button>
                                                    <button onClick={() => handleDeleteCategory('expense', cat.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;
