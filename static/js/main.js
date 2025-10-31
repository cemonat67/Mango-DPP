// Zero@Design Main JavaScript

// Global variables
let benchmarkData = [];
let currentProduct = null;
let productCategories = {};

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    loadProductCategories();
});

function initializeApp() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
    
    // Initialize popovers
    var popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    var popoverList = popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
    });
    
    // Add smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
    
    // Add loading states to forms
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', function() {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.classList.add('loading');
                submitBtn.disabled = true;
                
                // Re-enable after 3 seconds (fallback)
                setTimeout(() => {
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                }, 3000);
            }
        });
    });
    
    // Initialize category change handlers
    initializeCategoryHandlers();
}

// Load product categories from API
async function loadProductCategories() {
    try {
        const response = await apiRequest('/api/benchmark-data');
        if (response.categories) {
            productCategories = response.categories;
        }
    } catch (error) {
        console.error('Kategori verileri yüklenirken hata:', error);
    }
}

// Initialize category change handlers
function initializeCategoryHandlers() {
    const genderSelect = document.getElementById('productGender');
    const categorySelect = document.getElementById('productCategory');
    const typeSelect = document.getElementById('productType');
    
    if (genderSelect && categorySelect && typeSelect) {
        genderSelect.addEventListener('change', function() {
            updateCategoryOptions(this.value);
        });
        
        categorySelect.addEventListener('change', function() {
            updateTypeOptions(genderSelect.value, this.value);
        });
    }
}

// Update category options based on gender
function updateCategoryOptions(gender) {
    const categorySelect = document.getElementById('productCategory');
    const typeSelect = document.getElementById('productType');
    
    if (!categorySelect || !typeSelect) return;
    
    // Clear existing options
    categorySelect.innerHTML = '<option value="">Kategori seçiniz...</option>';
    typeSelect.innerHTML = '<option value="">Önce kategori seçiniz...</option>';
    
    if (gender && productCategories[gender]) {
        Object.keys(productCategories[gender]).forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = getCategoryDisplayName(category);
            categorySelect.appendChild(option);
        });
    }
}

// Update type options based on gender and category
function updateTypeOptions(gender, category) {
    const typeSelect = document.getElementById('productType');
    
    if (!typeSelect) return;
    
    // Clear existing options
    typeSelect.innerHTML = '<option value="">Ürün tipi seçiniz...</option>';
    
    if (gender && category && productCategories[gender] && productCategories[gender][category]) {
        productCategories[gender][category].forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            typeSelect.appendChild(option);
        });
    }
}

// Get display name for category
function getCategoryDisplayName(category) {
    const displayNames = {
        'Tops': 'Üst Giyim',
        'Bottoms': 'Alt Giyim',
        'Outerwear': 'Dış Giyim',
        'Dresses': 'Elbise',
        'Other': 'Diğer'
    };
    return displayNames[category] || category;
}

// Utility Functions
function showAlert(message, type = 'info', duration = 5000) {
    const alertContainer = document.getElementById('alertContainer') || createAlertContainer();
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    alertContainer.appendChild(alertDiv);
    
    // Auto dismiss
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, duration);
}

function createAlertContainer() {
    const container = document.createElement('div');
    container.id = 'alertContainer';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.right = '20px';
    container.style.zIndex = '9999';
    container.style.maxWidth = '400px';
    document.body.appendChild(container);
    return container;
}

function formatNumber(num, decimals = 1) {
    return parseFloat(num).toFixed(decimals);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('tr-TR');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// API Functions
async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API request failed:', error);
        showAlert('Bir hata oluştu. Lütfen tekrar deneyin.', 'danger');
        throw error;
    }
}

// Benchmark Functions
async function loadBenchmarkData() {
    try {
        const data = await apiRequest('/api/benchmark');
        benchmarkData = data.products;
        return benchmarkData;
    } catch (error) {
        console.error('Benchmark data loading failed:', error);
        return [];
    }
}

function filterBenchmarkData(searchTerm = '', category = '', sortBy = 'name') {
    let filtered = [...benchmarkData];
    
    // Search filter
    if (searchTerm) {
        filtered = filtered.filter(product => 
            product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            product.category.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }
    
    // Category filter
    if (category && category !== 'all') {
        filtered = filtered.filter(product => product.category === category);
    }
    
    // Sort
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'co2_asc':
                return a.co2_emission - b.co2_emission;
            case 'co2_desc':
                return b.co2_emission - a.co2_emission;
            case 'category':
                return a.category.localeCompare(b.category);
            default:
                return 0;
        }
    });
    
    return filtered;
}

// Style Card Functions
function calculateCO2(fiberComposition, processes, weight = 200) {
    let totalCO2 = 0;
    
    // Fiber CO2 calculation
    const fiberCO2Values = {
        'Pamuk': 5.9,
        'Organik Pamuk': 3.8,
        'Polyester': 9.5,
        'Geri Dönüştürülmüş Polyester': 4.2,
        'Yün': 10.8,
        'Keten': 2.1,
        'Tencel': 2.8,
        'Viskoz': 6.2,
        'Elastan': 15.6,
        'Naylon': 12.3
    };
    
    fiberComposition.forEach(fiber => {
        const co2Value = fiberCO2Values[fiber.type] || 5.0;
        totalCO2 += (co2Value * fiber.percentage / 100);
    });
    
    // Process CO2 additions
    if (processes.dyeing) {
        if (!processes.dyeing.naturalDye && !processes.dyeing.lowImpactDye) {
            totalCO2 += 1.5; // Conventional dyeing
        } else if (processes.dyeing.lowImpactDye) {
            totalCO2 += 0.8; // Low impact dyeing
        } else if (processes.dyeing.naturalDye) {
            totalCO2 += 0.3; // Natural dyeing
        }
    }
    
    if (processes.finishing) {
        let finishingCO2 = 1.2; // Base finishing CO2
        
        if (processes.finishing.enzymaticWash) finishingCO2 *= 0.8;
        if (processes.finishing.ozoneTreatment) finishingCO2 *= 0.7;
        if (processes.finishing.laserTreatment) finishingCO2 *= 0.6;
        
        totalCO2 += finishingCO2;
    }
    
    // Weight adjustment (base: 200g)
    totalCO2 = totalCO2 * (weight / 200);
    
    return Math.round(totalCO2 * 10) / 10;
}

function calculateSustainabilityScore(fiberComposition, processes, co2Emission) {
    let score = 100;
    
    // CO2 penalty
    if (co2Emission > 10) score -= 30;
    else if (co2Emission > 7) score -= 20;
    else if (co2Emission > 5) score -= 10;
    
    // Fiber composition bonus/penalty
    fiberComposition.forEach(fiber => {
        const sustainableFibers = ['Organik Pamuk', 'Geri Dönüştürülmüş Polyester', 'Keten', 'Tencel'];
        const unsustainableFibers = ['Polyester', 'Elastan', 'Naylon'];
        
        if (sustainableFibers.includes(fiber.type)) {
            score += (fiber.percentage / 100) * 15;
        } else if (unsustainableFibers.includes(fiber.type)) {
            score -= (fiber.percentage / 100) * 10;
        }
    });
    
    // Process bonuses
    if (processes.dyeing) {
        if (processes.dyeing.naturalDye) score += 10;
        else if (processes.dyeing.lowImpactDye) score += 5;
        if (processes.dyeing.waterBasedDye) score += 5;
    }
    
    if (processes.finishing) {
        if (processes.finishing.enzymaticWash) score += 5;
        if (processes.finishing.ozoneTreatment) score += 5;
        if (processes.finishing.laserTreatment) score += 5;
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
}

function getScoreCategory(score) {
    if (score >= 80) return { category: 'excellent', label: 'Mükemmel', class: 'score-excellent' };
    if (score >= 60) return { category: 'good', label: 'İyi', class: 'score-good' };
    if (score >= 40) return { category: 'fair', label: 'Orta', class: 'score-fair' };
    return { category: 'poor', label: 'Zayıf', class: 'score-poor' };
}

// AI Agent Functions
async function getAISuggestions(productType, material, currentCO2) {
    try {
        const response = await apiRequest('/api/ai-suggestions', {
            method: 'POST',
            body: JSON.stringify({
                product_type: productType,
                material: material,
                current_co2: currentCO2
            })
        });
        
        return response.suggestions;
    } catch (error) {
        console.error('AI suggestions failed:', error);
        return [];
    }
}

function generateBasicSuggestions(fiberComposition, processes, co2Emission) {
    const suggestions = [];
    
    // High CO2 suggestions
    if (co2Emission > 8) {
        suggestions.push({
            type: 'material',
            title: 'Geri Dönüştürülmüş Lif Kullanın',
            description: 'Geri dönüştürülmüş polyester veya organik pamuk kullanarak CO₂ emisyonunu %30-50 azaltabilirsiniz.',
            impact: 'high',
            co2_reduction: '30-50%'
        });
    }
    
    // Fiber-based suggestions
    const hasPolyester = fiberComposition.some(f => f.type === 'Polyester');
    if (hasPolyester) {
        suggestions.push({
            type: 'material',
            title: 'Geri Dönüştürülmüş Polyester',
            description: 'Konvansiyonel polyester yerine geri dönüştürülmüş polyester kullanın.',
            impact: 'medium',
            co2_reduction: '40-60%'
        });
    }
    
    const hasCotton = fiberComposition.some(f => f.type === 'Pamuk');
    if (hasCotton) {
        suggestions.push({
            type: 'material',
            title: 'Organik Pamuk',
            description: 'Konvansiyonel pamuk yerine organik pamuk tercih edin.',
            impact: 'medium',
            co2_reduction: '35-45%'
        });
    }
    
    // Process suggestions
    if (!processes.dyeing?.naturalDye && !processes.dyeing?.lowImpactDye) {
        suggestions.push({
            type: 'process',
            title: 'Düşük Etkili Boyama',
            description: 'Doğal veya düşük etkili boyar madde kullanarak çevresel etkiyi azaltın.',
            impact: 'medium',
            co2_reduction: '15-25%'
        });
    }
    
    if (!processes.finishing?.enzymaticWash) {
        suggestions.push({
            type: 'process',
            title: 'Enzimatik Yıkama',
            description: 'Geleneksel yıkama yerine enzimatik yıkama kullanın.',
            impact: 'low',
            co2_reduction: '10-20%'
        });
    }
    
    return suggestions.slice(0, 4); // Return max 4 suggestions
}

// Chart Functions
function createCO2BreakdownChart(canvasId, data) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Lif Üretimi', 'Boyama', 'Finishing', 'Diğer'],
            datasets: [{
                data: [
                    data.fiber || 0,
                    data.dyeing || 0,
                    data.finishing || 0,
                    data.other || 0
                ],
                backgroundColor: [
                    '#2e7d32',
                    '#4caf50',
                    '#8bc34a',
                    '#cddc39'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const percentage = ((value / data.total) * 100).toFixed(1);
                            return `${label}: ${value} kg (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Form Validation
function validateForm(formId) {
    const form = document.getElementById(formId);
    const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
    let isValid = true;
    
    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.classList.add('is-invalid');
            isValid = false;
        } else {
            input.classList.remove('is-invalid');
        }
    });
    
    return isValid;
}

// Local Storage Functions
function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Local storage save failed:', error);
        return false;
    }
}

function loadFromLocalStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        console.error('Local storage load failed:', error);
        return null;
    }
}

function removeFromLocalStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error('Local storage remove failed:', error);
        return false;
    }
}

// Export functions for global use
window.ZeroDesign = {
    showAlert,
    formatNumber,
    formatDate,
    apiRequest,
    loadBenchmarkData,
    filterBenchmarkData,
    calculateCO2,
    calculateSustainabilityScore,
    getScoreCategory,
    getAISuggestions,
    generateBasicSuggestions,
    createCO2BreakdownChart,
    validateForm,
    saveToLocalStorage,
    loadFromLocalStorage,
    removeFromLocalStorage
};
(function(){
  function safeJSON(data){try{return JSON.stringify(data,null,2)}catch(e){console.warn("[exportData] JSON stringify:",e);return"[]"}}
  function toCSV(arr){if(!Array.isArray(arr)||arr.length===0)return"";const c=[...new Set(arr.flatMap(o=>Object.keys(o||{})))];const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;const head=c.map(esc).join(",");const rows=arr.map(o=>c.map(k=>esc(o?.[k])).join(","));return [head,...rows].join("\n")}  
  function download(name,content,type="text/plain"){try{const b=new Blob([content],{type});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(u);a.remove()},100)}catch(e){console.error("[download]",e)}}

  window.exportData=function(){try{const data=window.APP_DATA||window.__DATA__||[];download("export.json",safeJSON(data),"application/json");if(Array.isArray(data)){const csv=toCSV(data);if(csv)download("export.csv",csv,"text/csv")}console.log("[exportData] OK")}catch(e){console.error("[exportData]",e)}};
  window.refreshData=function(){try{const n=Date.now();location.hash=location.hash.includes("refreshed")?("refreshed-"+n):"refreshed";window.dispatchEvent(new Event("app:refresh"));console.log("[refreshData] OK")}catch(e){console.error("[refreshData]",e)}};
  window.createStyleCard=function(container,item){try{const root=(typeof container==="string")?document.querySelector(container):container;if(!root){console.warn("[createStyleCard] container yok",container);return null}const d=item||{};const el=document.createElement("div");el.className="style-card";el.innerHTML=`<div class="style-card__head"><h3>${d.name||"Unnamed Style"}</h3><small>${d.code||""}</small></div><div class="style-card__body"><p><b>Fabric:</b> ${d.fabric||"-"}</p><p><b>GSM:</b> ${d.gsm??"-"}</p><p><b>CO₂e (kg):</b> ${d.co2??"-"}</p></div>`;root.appendChild(el);return el}catch(e){console.error("[createStyleCard]",e);return null}};
})();