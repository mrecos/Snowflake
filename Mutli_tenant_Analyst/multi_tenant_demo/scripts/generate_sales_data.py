#!/usr/bin/env python3
"""
Generate multi-tenant sales data for Cortex Secure Multi-Tenant Demo.

This script creates a CSV file with 150 rows of realistic sales data
distributed across 3 tenants. TENANT_100 has noticeably higher sales
to enable visual verification of tenant isolation.

Usage:
    python generate_sales_data.py

Output:
    ../data/sales_data.csv
"""

import os
import random
from datetime import datetime, timedelta
from pathlib import Path

try:
    import pandas as pd
    from faker import Faker
except ImportError:
    print("Installing required packages...")
    import subprocess
    subprocess.check_call(['pip', 'install', 'pandas', 'faker'])
    import pandas as pd
    from faker import Faker

# Initialize Faker
fake = Faker()
Faker.seed(42)
random.seed(42)

# Configuration
NUM_ROWS = 150
TENANTS = ['TENANT_100', 'TENANT_200', 'TENANT_300']

# Tenant distribution weights (TENANT_100 gets more data and higher sales)
TENANT_WEIGHTS = {
    'TENANT_100': 0.45,  # 45% of rows
    'TENANT_200': 0.30,  # 30% of rows  
    'TENANT_300': 0.25   # 25% of rows
}

# Sales multipliers per tenant (TENANT_100 has higher sales amounts)
SALES_MULTIPLIERS = {
    'TENANT_100': 2.5,   # Much higher sales
    'TENANT_200': 1.0,   # Baseline
    'TENANT_300': 0.8    # Lower sales
}

# Product catalog
PRODUCT_LINES = {
    'Electronics': [
        'Laptop Pro 15"', 'Wireless Mouse', 'USB-C Hub', 'Mechanical Keyboard',
        '4K Monitor', 'Webcam HD', 'Bluetooth Speaker', 'Noise-Canceling Headphones'
    ],
    'Furniture': [
        'Standing Desk', 'Ergonomic Chair', 'Filing Cabinet', 'Bookshelf',
        'Conference Table', 'Office Lamp', 'Whiteboard', 'Monitor Arm'
    ],
    'Software': [
        'Project Management Suite', 'CRM License', 'Analytics Platform',
        'Security Suite', 'Collaboration Tools', 'Design Software',
        'Database License', 'Cloud Storage Plan'
    ]
}

REGIONS = ['North', 'South', 'East', 'West', 'EMEA']

# Base prices for products (will be multiplied by tenant factor)
BASE_PRICES = {
    'Electronics': (50, 2000),
    'Furniture': (100, 3000),
    'Software': (200, 5000)
}

def generate_tenant_distribution():
    """Generate weighted tenant distribution."""
    tenants = []
    for _ in range(NUM_ROWS):
        r = random.random()
        cumulative = 0
        for tenant, weight in TENANT_WEIGHTS.items():
            cumulative += weight
            if r <= cumulative:
                tenants.append(tenant)
                break
    return tenants

def generate_sales_data():
    """Generate the complete sales dataset."""
    data = []
    
    # Generate tenant distribution
    tenants = generate_tenant_distribution()
    
    # Generate date range (last 12 months)
    end_date = datetime.now()
    start_date = end_date - timedelta(days=365)
    
    for i, tenant in enumerate(tenants):
        trans_id = f'TXN-{str(i+1).zfill(5)}'
        
        # Random date within last 12 months
        days_ago = random.randint(0, 365)
        order_date = (end_date - timedelta(days=days_ago)).strftime('%Y-%m-%d')
        
        # Select product
        product_line = random.choice(list(PRODUCT_LINES.keys()))
        product_name = random.choice(PRODUCT_LINES[product_line])
        
        # Select region
        region = random.choice(REGIONS)
        
        # Generate quantity (1-20)
        quantity = random.randint(1, 20)
        
        # Generate base sales amount based on product line
        min_price, max_price = BASE_PRICES[product_line]
        base_amount = random.uniform(min_price, max_price)
        
        # Apply tenant multiplier (TENANT_100 gets higher sales)
        sales_amount = round(base_amount * quantity * SALES_MULTIPLIERS[tenant], 2)
        
        # Generate profit margin (10-40%)
        profit_margin = round(random.uniform(0.10, 0.40), 2)
        
        data.append({
            'TRANS_ID': trans_id,
            'CONTAINER_ID': tenant,
            'ORDER_DATE': order_date,
            'PRODUCT_LINE': product_line,
            'PRODUCT_NAME': product_name,
            'REGION': region,
            'QUANTITY': quantity,
            'SALES_AMOUNT': sales_amount,
            'PROFIT_MARGIN': profit_margin
        })
    
    return pd.DataFrame(data)

def print_summary(df):
    """Print summary statistics by tenant."""
    print("\n" + "="*60)
    print("SALES DATA SUMMARY BY TENANT")
    print("="*60)
    
    for tenant in TENANTS:
        tenant_df = df[df['CONTAINER_ID'] == tenant]
        total_sales = tenant_df['SALES_AMOUNT'].sum()
        row_count = len(tenant_df)
        avg_sale = tenant_df['SALES_AMOUNT'].mean()
        
        print(f"\n{tenant}:")
        print(f"  Rows: {row_count}")
        print(f"  Total Sales: ${total_sales:,.2f}")
        print(f"  Avg Sale: ${avg_sale:,.2f}")
    
    print("\n" + "="*60)
    print(f"TOTAL ROWS: {len(df)}")
    print(f"TOTAL SALES: ${df['SALES_AMOUNT'].sum():,.2f}")
    print("="*60)

def main():
    print("Generating multi-tenant sales data...")
    
    # Generate data
    df = generate_sales_data()
    
    # Create output directory
    output_dir = Path(__file__).parent.parent / 'data'
    output_dir.mkdir(exist_ok=True)
    
    # Save to CSV
    output_path = output_dir / 'sales_data.csv'
    df.to_csv(output_path, index=False)
    
    print(f"\nData saved to: {output_path}")
    
    # Print summary
    print_summary(df)
    
    # Show sample data
    print("\nSample data (first 5 rows):")
    print(df.head().to_string(index=False))

if __name__ == '__main__':
    main()

