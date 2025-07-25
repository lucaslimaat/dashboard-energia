/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { createClient, Session, User } from '@supabase/supabase-js';

// --- TYPE DEFINITIONS ---

// This is a generic type for Supabase JSON columns, good practice to have.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Define types for Supabase client to fix type errors
// Corrected to use a simpler empty object type format for Views, Functions, etc.
export type Database = {
  public: {
    Tables: {
      energy_bills: {
        Row: {
          id: number
          user_id: string // Link to auth.users
          company: string
          installation_number: string
          bill_class: string
          date: string
          due_date: string | null
          cost: number
          consumption: number
          compensated_energy_kwh: number
          unit_price: number
          generation_balance_kwh: number
          contracted_discount: number | null
          paid: boolean
          compensated_energy_type: 'INTERNA' | 'EXTERNA'
        }
        Insert: {
          id?: number
          user_id: string // Link to auth.users
          company: string
          installation_number: string
          bill_class: string
          date: string
          due_date?: string | null
          cost: number
          consumption: number
          compensated_energy_kwh: number
          unit_price: number
          generation_balance_kwh: number
          contracted_discount?: number | null
          paid?: boolean
          compensated_energy_type?: 'INTERNA' | 'EXTERNA'
        }
        Update: {
          id?: number
          user_id?: string
          company?: string
          installation_number?: string
          bill_class?: string
          date?: string
          due_date?: string | null
          cost?: number
          consumption?: number
          compensated_energy_kwh?: number
          unit_price?: number
          generation_balance_kwh?: number
          contracted_discount?: number | null
          paid?: boolean
          compensated_energy_type?: 'INTERNA' | 'EXTERNA'
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}

interface GeminiBillData {
    company: string;
    installationNumber: string;
    billClass: string;
    date: string;
    dueDate: string | null;
    cost: number;
    consumption: number;
    compensatedEnergyKwh: number;
    unitPrice: number;
    generationBalanceKwh: number;
}


// --- STATE MANAGEMENT ---
let bills: Database['public']['Tables']['energy_bills']['Row'][] = [];
let modalPromiseResolver: (value: boolean) => void;

// --- DOM ELEMENTS ---
// Auth Elements
const authContainer = document.getElementById('auth-container')!;
const appContainer = document.getElementById('app-container')!;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const loginEmailInput = document.getElementById('login-email') as HTMLInputElement;
const loginPasswordInput = document.getElementById('login-password') as HTMLInputElement;
const authMessage = document.getElementById('auth-message')!;

// App Elements
const userEmailEl = document.getElementById('user-email')!;
const logoutButton = document.getElementById('logout-button') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const processButton = document.getElementById('process-button') as HTMLButtonElement;
const fileListDiv = document.getElementById('file-list')!;
const loadingOverlay = document.getElementById('loading-overlay')!;
const loadingText = loadingOverlay.querySelector('p')!;
const tableBody = document.getElementById('bills-table-body')!;
const totalClientsEl = document.getElementById('total-clients')!;
const totalConsumptionEl = document.getElementById('total-consumption')!;
const totalCompensatedEl = document.getElementById('total-compensated')!;
const totalBalanceEl = document.getElementById('total-balance')!;
const totalCostEl = document.getElementById('total-cost')!;

// Admin Panel Elements
const adminPanel = document.getElementById('admin-panel')!;
const createUserForm = document.getElementById('create-user-form') as HTMLFormElement;
const createUserEmailInput = document.getElementById('create-user-email') as HTMLInputElement;
const createUserPasswordInput = document.getElementById('create-user-password') as HTMLInputElement;

// Modal Elements
const modalOverlay = document.getElementById('custom-modal-overlay')!;
const modalTitle = document.getElementById('modal-title')!;
const modalMessage = document.getElementById('modal-message')!;
const modalConfirmBtn = document.getElementById('modal-confirm-btn') as HTMLButtonElement;
const modalCancelBtn = document.getElementById('modal-cancel-btn') as HTMLButtonElement;


// --- API CLIENTS ---
// Supabase
const supabaseUrl = "https://lpgohuagjekitxhmxkwt.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwZ29odWFnamVraXR4aG14a3d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxMjg4MDMsImV4cCI6MjA2ODcwNDgwM30.psu2TDq1VJYcyyege8hUu1-84Iq3jLdDJZYZPV2JJlQ";
const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);


// --- FUNCTIONS ---

/**
 * Shows a custom modal for confirmations or alerts.
 * @param title The title of the modal.
 * @param message The message to display.
 * @param type 'confirm' for two buttons, 'alert' for one.
 * @returns A promise that resolves to true if confirmed, false if canceled/closed.
 */
function showCustomModal(title: string, message: string, type: 'confirm' | 'alert' = 'alert'): Promise<boolean> {
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  modalOverlay.style.display = 'flex';

  if (type === 'confirm') {
    modalConfirmBtn.style.display = 'inline-block';
    modalCancelBtn.style.display = 'inline-block';
    modalConfirmBtn.className = 'btn-danger';
    modalCancelBtn.className = 'btn-secondary';
    modalConfirmBtn.textContent = 'Confirmar';
  } else { // 'alert'
    modalConfirmBtn.style.display = 'inline-block';
    modalCancelBtn.style.display = 'none';
    modalConfirmBtn.className = 'btn-primary';
    modalConfirmBtn.textContent = 'OK';
  }

  return new Promise((resolve) => {
    modalPromiseResolver = resolve;
  });
}

/**
 * Fetches bills from the Supabase database for the currently logged-in user and updates the UI.
 */
async function fetchBills() {
  // First, get the current user session.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // If there's no user, clear the bills and stop.
    bills = [];
    updateAll();
    return;
  }

  // Fetch bills that belong to the logged-in user.
  const { data, error } = await supabase
    .from('energy_bills')
    .select('*')
    .eq('user_id', user.id) // Filter by the user's ID.
    .order('date', { ascending: false });

  if (error) {
    console.error('Erro ao buscar contas:', error);
    const errorMessage = error.message || 'Ocorreu um erro desconhecido.';
    let friendlyMessage = `Não foi possível carregar suas contas.\n\nMotivo: ${errorMessage}`;

    if (errorMessage.includes('security policy') || errorMessage.includes('RLS')) {
        friendlyMessage += '\n\nEste erro geralmente significa que a política de segurança (RLS) no Supabase não permite a leitura (SELECT) dos dados. Verifique se existe uma política para SELECT na tabela `energy_bills` que permite o acesso para o usuário logado.'
    } else {
        friendlyMessage += '\n\nVerifique sua conexão com a internet e as configurações do Supabase.'
    }

    await showCustomModal('Erro ao Carregar Dados', friendlyMessage);
    return;
  }
  
  bills = data || [];
  updateAll();
}


/**
 * Converts a File object to a Base64 string.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Handles file selection, updating the UI to show selected files.
 */
function handleFileSelection() {
  if (!fileInput.files || fileInput.files.length === 0) {
    fileListDiv.innerHTML = '';
    processButton.disabled = true;
    return;
  }

  const fileNames = Array.from(fileInput.files).map(f => `<li>${f.name}</li>`).join('');
  fileListDiv.innerHTML = `<ul>${fileNames}</ul>`;
  processButton.disabled = false;
}

/**
 * Processes uploaded files. It sends them to a serverless function which
 * handles both the AI processing and saving to the database.
 */
async function processFiles() {
  const files = fileInput.files;
  if (!files || files.length === 0) {
    await showCustomModal('Atenção', 'Por favor, selecione os arquivos das contas primeiro.');
    return;
  }

  // A session is required to make an authenticated call to the serverless function.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    await showCustomModal('Erro de Autenticação', 'Sua sessão expirou. Por favor, faça login novamente.');
    return;
  }

  loadingText.textContent = 'Enviando e processando contas...';
  loadingOverlay.style.display = 'flex';

  try {
    const fileDataForApi = await Promise.all(
      Array.from(files).map(async (file) => {
        const base64Data = await fileToBase64(file);
        return {
          mimeType: file.type,
          data: base64Data,
        };
      })
    );

    // The serverless function now handles both AI processing and DB insertion.
    // We send the auth token to identify the user on the server.
    const apiResponse = await fetch('/api/process-bill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ files: fileDataForApi }),
    });

    const result = await apiResponse.json();

    if (!apiResponse.ok) {
        // If the server returned an error, it will be in result.error
        throw new Error(result.error || `Erro do Servidor: ${apiResponse.status}`);
    }

    // Success! The server handled everything. Now, show the result message
    // and refresh the local data.
    await showCustomModal('Processamento Concluído', result.message || 'Operação finalizada.');
    await fetchBills(); // Refresh the table with new data

  } catch (error: any) {
    console.error("Erro ao processar arquivos:", error);
    const errorMessage = error.message || 'Ocorreu um erro desconhecido.';
    await showCustomModal('Erro Inesperado', `Ocorreu um erro ao processar os arquivos.\n\nMotivo: ${errorMessage}`);
  } finally {
    loadingOverlay.style.display = 'none';
    fileInput.value = '';
    handleFileSelection();
  }
}


/**
 * Formats a number as Brazilian currency (BRL).
 */
function formatCurrency(value: number, minimumFractionDigits = 2): string {
  if (typeof value !== 'number') return 'N/A';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: minimumFractionDigits
  }).format(value);
}

/**
 * Renders all bills in the data table.
 */
function renderTable() {
  tableBody.innerHTML = '';
  if (bills.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="16" style="text-align:center;">Nenhuma conta processada ainda.</td></tr>`;
    return;
  }
  
  // Sorting is now handled by the fetchBills query, but we can re-sort locally if needed.
  const sortedBills = [...bills];
  
  sortedBills.forEach(bill => {
    const row = document.createElement('tr');
    const statusClass = bill.paid ? 'status-paid' : 'status-pending';
    const statusText = bill.paid ? 'Pago' : 'Pendente';
    const compTypeClass = bill.compensated_energy_type === 'INTERNA' ? 'comp-type-internal' : 'comp-type-external';
    const compTypeText = bill.compensated_energy_type;
    const consumedEnergyValue = bill.consumption * bill.unit_price;
    const discountedValue = consumedEnergyValue * (1 - (bill.contracted_discount || 0) / 100);

    row.innerHTML = `
      <td>${bill.company}</td>
      <td>${bill.installation_number}</td>
      <td>${formatDate(bill.date)}</td>
      <td>${formatFullDate(bill.due_date)}</td>
      <td>${bill.bill_class}</td>
      <td>${bill.consumption.toLocaleString('pt-BR')}</td>
      <td>${bill.compensated_energy_kwh.toLocaleString('pt-BR')}</td>
      <td><button class="btn-comp-type-toggle ${compTypeClass}" data-id="${bill.id}">${compTypeText}</button></td>
      <td>${bill.generation_balance_kwh.toLocaleString('pt-BR')}</td>
      <td>${formatCurrency(bill.unit_price, 4)}</td>
      <td>${formatCurrency(consumedEnergyValue)}</td>
      <td><input type="number" class="input-discount" value="${bill.contracted_discount || 0}" data-id="${bill.id}" min="0" step="0.01" aria-label="Desconto para ${bill.company} de ${formatDate(bill.date)}"></td>
      <td>${formatCurrency(discountedValue)}</td>
      <td>${formatCurrency(bill.cost)}</td>
      <td><button class="btn-status-toggle ${statusClass}" data-id="${bill.id}">${statusText}</button></td>
      <td>
        <button class="btn-delete" data-id="${bill.id}" aria-label="Excluir conta de ${bill.company} para ${formatDate(bill.date)}">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg>
        </button>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

/**
 * Handles clicks on the table for various actions. This function uses event
 * delegation to handle clicks on dynamically created buttons.
 */
function handleTableClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    // Use .closest() to find the nearest button, making the event handler
    // more robust in case the user clicks on a child element of the button (like the SVG).
    const button = target.closest('button');

    // If a button wasn't clicked, exit the function.
    if (!button) {
        return;
    }

    const idString = button.getAttribute('data-id');
    // If the button doesn't have a data-id, exit.
    if (!idString) {
        return;
    }

    const id = parseInt(idString, 10);
    // If the data-id is not a valid number, exit.
    if (isNaN(id)) {
        return;
    }

    // Determine which action to take based on the button's class.
    if (button.classList.contains('btn-status-toggle')) {
        togglePaidStatus(id);
    } else if (button.classList.contains('btn-comp-type-toggle')) {
        toggleCompensatedType(id);
    } else if (button.classList.contains('btn-delete')) {
        deleteBill(id);
    }
}


/**
 * Handles changes to the discount input fields in the table.
 */
async function handleDiscountChange(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.classList.contains('input-discount')) {
        const id = parseFloat(target.getAttribute('data-id')!);
        const bill = bills.find(b => b.id === id);
        if (bill) {
            const newValue = parseFloat(target.value);
            if (!isNaN(newValue) && bill.contracted_discount !== newValue) {
                const { error } = await supabase
                    .from('energy_bills')
                    .update({ contracted_discount: newValue })
                    .eq('id', id);
                
                if (error) {
                    console.error("Erro ao atualizar desconto:", error);
                    await showCustomModal("Erro", "Falha ao salvar o desconto.");
                    target.value = (bill.contracted_discount || 0).toString(); // Revert on UI
                } else {
                    bill.contracted_discount = newValue; // Update local state
                    renderTable(); // Re-render to update calculated fields
                }
            }
        }
    }
}

/**
 * Deletes a bill from the database after user confirmation.
 */
async function deleteBill(id: number) {
    const billToDelete = bills.find(b => b.id === id);
    if (!billToDelete) return;

    const confirmation = await showCustomModal(
        'Confirmar Exclusão',
        `Tem certeza que deseja excluir a conta de ${billToDelete.company} (${formatDate(billToDelete.date)})?\n\nEsta ação não pode ser desfeita.`,
        'confirm'
    );


    if (confirmation) {
        loadingText.textContent = 'Excluindo conta...';
        loadingOverlay.style.display = 'flex';
        try {
            // By adding .select(), we ask Supabase to return the deleted data.
            // If RLS prevents the deletion, `data` will be an empty array.
            const { data, error } = await supabase
                .from('energy_bills')
                .delete()
                .eq('id', id)
                .select();

            if (error) {
                // If there's an explicit API or database error, throw it.
                throw error;
            }

            // This is the crucial check for silent RLS failures.
            if (!data || data.length === 0) {
                throw new Error("A exclusão falhou no banco de dados. A Política de Segurança (RLS) provavelmente impediu a operação de DELETE.");
            }

            // If we reach here, the deletion was successful in the database.
            // Now, we can safely update the UI.
            bills = bills.filter(b => b.id !== id);
            updateAll();
            await showCustomModal('Sucesso', 'Conta excluída com sucesso!');

        } catch (error: any) {
            console.error('Erro ao excluir conta:', error);
            const errorMessage = error.message || 'Ocorreu um erro desconhecido.';
            await showCustomModal('Falha na Exclusão', `Não foi possível excluir a conta.\n\nMotivo: ${errorMessage}`);
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }
}

/**
 * Toggles the paid status of a bill and updates the database.
 */
async function togglePaidStatus(id: number) {
  const bill = bills.find(b => b.id === id);
  if (bill) {
    const newStatus = !bill.paid;
    const { error } = await supabase
        .from('energy_bills')
        .update({ paid: newStatus })
        .eq('id', id);
    
    if (error) {
        console.error("Erro ao atualizar status:", error);
        await showCustomModal("Erro", "Falha ao atualizar o status da conta.");
    } else {
        bill.paid = newStatus;
        updateAll();
    }
  }
}

/**
 * Toggles the compensated energy type of a bill and updates the database.
 */
async function toggleCompensatedType(id: number) {
  const bill = bills.find(b => b.id === id);
  if (bill) {
    const newType: 'INTERNA' | 'EXTERNA' = bill.compensated_energy_type === 'INTERNA' ? 'EXTERNA' : 'INTERNA';
    const { error } = await supabase
        .from('energy_bills')
        .update({ compensated_energy_type: newType })
        .eq('id', id);

    if (error) {
        console.error("Erro ao atualizar tipo de compensação:", error);
        await showCustomModal("Erro", "Falha ao atualizar o tipo de compensação.");
    } else {
        bill.compensated_energy_type = newType;
        updateAll();
    }
  }
}

/**
 * Helper function to format date string YYYY-MM to Month Year in Portuguese.
 */
function formatDate(dateString: string): string {
  if (!dateString || !dateString.includes('-')) return "Data Inválida";
  const [year, month] = dateString.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Helper function to format date string YYYY-MM-DD to DD/MM/YYYY.
 */
function formatFullDate(dateString: string | null): string {
  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return "N/A";
  const [year, month, day] = dateString.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Calculates and updates the summary metrics in the sidebar.
 */
function updateSummaryMetrics() {
  const totalClients = bills.length;
  const totalConsumption = bills.reduce((sum, bill) => sum + bill.consumption, 0);
  const totalCompensated = bills.reduce((sum, bill) => sum + bill.compensated_energy_kwh, 0);
  const totalBalance = bills.reduce((sum, bill) => sum + bill.generation_balance_kwh, 0);
  const totalCost = bills.reduce((sum, bill) => sum + bill.cost, 0);

  totalClientsEl.textContent = totalClients.toString();
  totalConsumptionEl.textContent = `${totalConsumption.toLocaleString('pt-BR')} kWh`;
  totalCompensatedEl.textContent = `${totalCompensated.toLocaleString('pt-BR')} kWh`;
  totalBalanceEl.textContent = `${totalBalance.toLocaleString('pt-BR')} kWh`;
  totalCostEl.textContent = formatCurrency(totalCost);
}

/**
 * Calls all update functions to refresh the UI.
 */
function updateAll() {
  renderTable();
  updateSummaryMetrics();
}

/**
 * Shows a message in the auth UI.
 */
function showAuthMessage(message: string, type: 'success' | 'error') {
    authMessage.textContent = message;
    authMessage.className = `auth-message ${type}`;
    authMessage.classList.remove('hidden');
}

// --- AUTHENTICATION LOGIC ---
async function handleLogin(e: Event) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
        email: loginEmailInput.value,
        password: loginPasswordInput.value,
    });
    if (error) {
        showAuthMessage(error.message, 'error');
    } else {
        loginForm.reset();
        authMessage.classList.add('hidden');
    }
}

async function handleCreateUser(e: Event) {
    e.preventDefault();
    const email = createUserEmailInput.value;
    const password = createUserPasswordInput.value;

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                role: 'user' // Set default role for new users
            }
        }
    });

    if (error) {
        await showCustomModal('Erro ao Criar Usuário', `Não foi possível criar o usuário.\n\nMotivo: ${error.message}`);
    } else if (data.user) {
        await showCustomModal('Sucesso', `Usuário ${data.user.email} criado com sucesso! Um e-mail de confirmação foi enviado.`);
        createUserForm.reset();
    }
}

async function handleLogout() {
    await supabase.auth.signOut();
}

/**
 * Manages UI and data fetching based on auth state.
 */
async function handleAuthStateChange(event: string, session: Session | null) {
  const user = session?.user;
  
  if (user) {
    // User is logged in
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');
    userEmailEl.textContent = user.email || '';
    
    // Check for admin role in user_metadata
    const isAdmin = user.user_metadata?.role === 'admin';
    if (isAdmin) {
      adminPanel.classList.remove('hidden');
    } else {
      adminPanel.classList.add('hidden');
    }

    loadingText.textContent = 'Carregando dados...';
    loadingOverlay.style.display = 'flex';
    await fetchBills();
    loadingOverlay.style.display = 'none';
  } else {
    // User is logged out
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    adminPanel.classList.add('hidden');
    bills = [];
    updateAll();
  }
}

// --- INITIALIZATION ---
async function init() {
  // Check for Supabase keys first.
  if (!supabaseUrl || !supabaseAnonKey) {
    await showCustomModal("Erro de Configuração", "As chaves de API do Supabase não foram encontradas. O aplicativo não pode funcionar.");
    return;
  }
  
  // Setup modal listeners
  modalConfirmBtn.addEventListener('click', () => {
    if (modalPromiseResolver) modalPromiseResolver(true);
    modalOverlay.style.display = 'none';
  });
  modalCancelBtn.addEventListener('click', () => {
    if (modalPromiseResolver) modalPromiseResolver(false);
    modalOverlay.style.display = 'none';
  });
  
  // Setup Auth listeners
  loginForm.addEventListener('submit', handleLogin);
  logoutButton.addEventListener('click', handleLogout);
  createUserForm.addEventListener('submit', handleCreateUser);


  // Setup App listeners
  processButton.addEventListener('click', processFiles);
  fileInput.addEventListener('change', handleFileSelection);
  tableBody.addEventListener('click', handleTableClick);
  tableBody.addEventListener('change', handleDiscountChange);
  
  // Listen for auth state changes
  supabase.auth.onAuthStateChange((event, session) => {
    handleAuthStateChange(event, session);
  });
  
}

// Start the application
init();