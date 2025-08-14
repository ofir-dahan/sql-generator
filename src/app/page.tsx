"use client";

// Import MobX configuration to prevent version conflicts
import './mobx-config';

import { useState, useCallback, useEffect, useMemo, memo } from "react";
import { useDropzone } from "react-dropzone";
import { v4 as uuidv4 } from 'uuid';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ErrorBoundary } from './ErrorBoundary';

// Memoized SQL syntax highlighter component for better performance
const MemoizedSqlHighlighter = memo(function MemoizedSqlHighlighter({ script }: { script: string }) {
  return (
    <SyntaxHighlighter
      language="sql"
      style={vscDarkPlus}
      showLineNumbers={true}
      lineNumberStyle={{ color: '#6b7280', fontSize: '12px' }}
      customStyle={{
        margin: 0,
        padding: '1rem',
        background: 'transparent',
        fontSize: '14px'
      }}
    >
      {script}
    </SyntaxHighlighter>
  );
});

type JsonData = Record<string, unknown>[];
type SqlTab = {
  id: string;
  name: string;
  script: string;
  rowCount: number;
  type: 'all' | 'without-null' | 'with-null' | 'batch';
};
type TemplateHistory = {
  id: string;
  name: string;
  template: string;
  createdAt: string;
  lastUsed: string;
};

export default function Home() {
  const [jsonData, setJsonData] = useState<JsonData | null>(null);
  const [sqlTabs, setSqlTabs] = useState<SqlTab[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [batchSize, setBatchSize] = useState(1000);
  const [sqlTemplate, setSqlTemplate] = useState("");
  const [debouncedSqlTemplate, setDebouncedSqlTemplate] = useState("");
  const [batchSizeChanged, setBatchSizeChanged] = useState(false);
  const [manualData, setManualData] = useState("");
  const [inputMode, setInputMode] = useState<'file' | 'manual'>('file');
  const [copySuccess, setCopySuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [templateHistory, setTemplateHistory] = useState<TemplateHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [templateName, setTemplateName] = useState("");

  // Debounce SQL template input for better performance
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSqlTemplate(sqlTemplate);
    }, 150); // Reduced from 300ms to 150ms for better responsiveness

    return () => clearTimeout(timer);
  }, [sqlTemplate]);

  // Load settings from localStorage on component mount
  useEffect(() => {
    const savedTemplate = localStorage.getItem('sqlTemplate');
    const savedBatchSize = localStorage.getItem('batchSize');
    const savedHistory = localStorage.getItem('templateHistory');
    
    if (savedTemplate) {
      setSqlTemplate(savedTemplate);
    } else {
      setSqlTemplate("INSERT INTO [dbo].[ResCollectionPointsMapping] (TenbisRestaurantId, CollectionPointId, Created, Updated)\nVALUES\n({corporateIdentifier},{id},GETDATE(),GETDATE());");
    }
    
    if (savedBatchSize) {
      setBatchSize(parseInt(savedBatchSize, 10));
    }

    if (savedHistory) {
      try {
        setTemplateHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error('Error parsing template history:', error);
      }
    }
  }, []);

  // Save settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem('sqlTemplate', debouncedSqlTemplate);
  }, [debouncedSqlTemplate]);

  useEffect(() => {
    localStorage.setItem('batchSize', batchSize.toString());
  }, [batchSize]);

  useEffect(() => {
    localStorage.setItem('templateHistory', JSON.stringify(templateHistory));
  }, [templateHistory]);

  const validateJson = (data: unknown): string[] => {
    const errors: string[] = [];
    
    if (!Array.isArray(data)) {
      errors.push("JSON must be an array of objects");
      return errors;
    }
    
    if (data.length === 0) {
      errors.push("JSON array cannot be empty");
      return errors;
    }
    
    if (typeof data[0] !== 'object' || data[0] === null) {
      errors.push("Array elements must be objects");
      return errors;
    }
    
    return errors;
  };

  const validateSqlTemplate = useCallback((template: string): string[] => {
    const errors: string[] = [];
    
    if (!template.trim()) {
      errors.push("SQL template cannot be empty");
      return errors;
    }
    
    // Check for double curly braces (for comma-separated values)
    const doubleCurlyMatches = template.match(/\{\{([^}]+)\}\}/g) || [];
    
    if (doubleCurlyMatches.length > 0) {
      // For templates with double curly braces, validation is more flexible
      // They don't necessarily need INSERT INTO or VALUES clauses
      return errors;
    }
    
    // Validation for templates - now allows standalone VALUES statements
    if (template.toLowerCase().includes('insert into') && !template.toLowerCase().includes('values')) {
      errors.push("INSERT statements must contain 'VALUES' clause");
    }
    
    if (template.toLowerCase().includes('insert into')) {
      const valuesMatch = template.match(/VALUES\s*\((.*)\)/is);
      if (!valuesMatch) {
        errors.push("Invalid VALUES clause format. Use: VALUES ({placeholder})");
      }
    }
    
    return errors;
  }, []);

  const saveTemplate = useCallback(() => {
    if (!templateName.trim() || !sqlTemplate.trim()) {
      setErrors(["Template name and content are required"]);
      return;
    }

    const newTemplate: TemplateHistory = {
      id: uuidv4(),
      name: templateName.trim(),
      template: sqlTemplate,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    };

    const updatedHistory = [newTemplate, ...templateHistory.filter(t => t.template !== sqlTemplate)];
    setTemplateHistory(updatedHistory);
    setTemplateName("");
    setErrors([]);
  }, [templateName, sqlTemplate, templateHistory]);

  const loadTemplate = useCallback((template: TemplateHistory) => {
    setSqlTemplate(template.template);
    
    // Update last used timestamp
    const updatedHistory = templateHistory.map(t => 
      t.id === template.id 
        ? { ...t, lastUsed: new Date().toISOString() }
        : t
    );
    setTemplateHistory(updatedHistory);
    setShowHistory(false);
  }, [templateHistory]);

  const deleteTemplate = useCallback((templateId: string) => {
    const updatedHistory = templateHistory.filter(t => t.id !== templateId);
    setTemplateHistory(updatedHistory);
  }, [templateHistory]);

  // Function to parse CSV data
  const parseCSV = useCallback((csvText: string): JsonData => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header row and one data row');
    }

    // Simple CSV parser that handles quoted values
    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      
      result.push(current.trim());
      return result;
    };

    const headers = parseCsvLine(lines[0]).map(header => header.replace(/["']/g, ''));
    const data: JsonData = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = parseCsvLine(line).map(value => {
        value = value.replace(/^["']|["']$/g, ''); // Remove surrounding quotes
        
        // Try to convert to number if possible
        if (value === '' || value.toLowerCase() === 'null') {
          return null;
        }
        const num = Number(value);
        return !isNaN(num) && value !== '' ? num : value;
      });

      if (values.length === headers.length) {
        const row: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        data.push(row);
      }
    }

    return data;
  }, []);

  // Function to parse TSV (Tab-Separated Values) data - for SQL query results
  const parseTSV = useCallback((tsvText: string): JsonData => {
    const lines = tsvText.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('Data must have at least a header row and one data row');
    }

    const headers = lines[0].split('\t').map(header => header.trim());
    const data: JsonData = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split('\t').map(value => {
        value = value.trim();
        
        // Try to convert to number if possible
        if (value === '' || value.toLowerCase() === 'null') {
          return null;
        }
        const num = Number(value);
        return !isNaN(num) && value !== '' ? num : value;
      });

      if (values.length === headers.length) {
        const row: Record<string, unknown> = {};
        headers.forEach((header, index) => {
          row[header] = values[index];
        });
        data.push(row);
      }
    }

    return data;
  }, []);

  // Function to detect data format and parse accordingly
  const parseDataText = useCallback((text: string): JsonData => {
    // Try JSON first
    try {
      const jsonData = JSON.parse(text);
      return Array.isArray(jsonData) ? jsonData : [jsonData];
    } catch {
      // Not JSON, check for tabs (TSV/SQL query results)
      if (text.includes('\t')) {
        return parseTSV(text);
      } else {
        // Assume CSV
        return parseCSV(text);
      }
    }
  }, [parseTSV, parseCSV]);

  // Function to process manual data input
  const processManualData = useCallback(() => {
    if (!manualData.trim()) {
      setErrors(["Please enter some data"]);
      return;
    }

    setIsLoading(true);
    setErrors([]);
    setFileName("Manual Input");

    try {
      const processedData = parseDataText(manualData);

      const validationErrors = validateJson(processedData);
      if (validationErrors.length > 0) {
        setErrors(validationErrors);
        setJsonData(null);
      } else {
        setJsonData(processedData);
        setSqlTabs([]);
        setActiveTab(0);
      }
    } catch (error) {
      setErrors([`Invalid data format: ${error instanceof Error ? error.message : 'Unknown error'}`]);
      setJsonData(null);
    } finally {
      setIsLoading(false);
    }
  }, [manualData, parseDataText]);

  const formatDate = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setIsLoading(true);
      setErrors([]);
      setFileName(file.name);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          let processedData: JsonData;

          // Check file extension to determine parsing method
          if (file.name.toLowerCase().endsWith('.csv')) {
            // Parse as CSV
            processedData = parseCSV(text);
          } else if (file.name.toLowerCase().endsWith('.tsv') || file.name.toLowerCase().endsWith('.txt')) {
            // Parse as TSV (tab-separated values)
            processedData = parseTSV(text);
          } else {
            // Parse as JSON
            const data = JSON.parse(text);
            processedData = data;
            if (data.collectPoints && Array.isArray(data.collectPoints)) {
              processedData = data.collectPoints;
            }
          }
          
          const validationErrors = validateJson(processedData);
          if (validationErrors.length > 0) {
            setErrors(validationErrors);
            setJsonData(null);
          } else {
            setJsonData(processedData);
            setSqlTabs([]);
            setActiveTab(0);
          }
        } catch (error) {
          setErrors([`Invalid file format: ${error instanceof Error ? error.message : 'Unknown error'}`]);
          setJsonData(null);
        } finally {
          setIsLoading(false);
        }
      };
      reader.readAsText(file);
    }
  }, [parseCSV, parseTSV]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 
      'application/json': ['.json'],
      'text/csv': ['.csv'],
      'application/csv': ['.csv']
    } 
  });

  const generateSqlScript = useCallback(() => {
    if (!jsonData) {
      setErrors(["JSON data is not loaded"]);
      return;
    }

    const templateErrors = validateSqlTemplate(sqlTemplate);
    if (templateErrors.length > 0) {
      setErrors(templateErrors);
      return;
    }

    setIsLoading(true);
    setErrors([]);
    setBatchSizeChanged(false);

    // First, handle double curly braces {{}} for comma-separated values
    let processedTemplate = sqlTemplate;
    const doubleCurlyMatches = sqlTemplate.match(/\{\{([^}]+)\}\}/g) || [];
    
    if (doubleCurlyMatches.length > 0) {
      // For templates with double curly braces, generate only ALL and Without NULL tabs
      doubleCurlyMatches.forEach(placeholder => {
        const key = placeholder.replace(/\{\{|\}\}/g, '');
        
        // Get all unique values for this key from the JSON data
        const allValues = jsonData
          .map(row => row[key])
          .filter((value, index, arr) => value !== null && value !== undefined && arr.indexOf(value) === index)
          .map(value => typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : String(value));
        
        // Replace placeholder with all values for ALL tab
        processedTemplate = processedTemplate.replace(placeholder, allValues.join(','));
      });

      // Create tabs for double curly brace templates
      const tabs: SqlTab[] = [
        {
          id: 'all',
          name: 'ALL',
          script: processedTemplate,
          rowCount: jsonData.length,
          type: 'all'
        }
      ];

      // Create Without NULL tab if there are non-null values
      const hasNonNullValues = doubleCurlyMatches.some(placeholder => {
        const key = placeholder.replace(/\{\{|\}\}/g, '');
        return jsonData.some(row => row[key] !== null && row[key] !== undefined);
      });

      if (hasNonNullValues) {
        let withoutNullTemplate = sqlTemplate;
        doubleCurlyMatches.forEach(placeholder => {
          const key = placeholder.replace(/\{\{|\}\}/g, '');
          
          const valuesWithoutNull = jsonData
            .map(row => row[key])
            .filter((value, index, arr) => value !== null && value !== undefined && arr.indexOf(value) === index)
            .map(value => typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : String(value));
          
          withoutNullTemplate = withoutNullTemplate.replace(placeholder, valuesWithoutNull.join(','));
        });

        tabs.push({
          id: 'without-null',
          name: 'Without NULL values',
          script: withoutNullTemplate,
          rowCount: jsonData.filter(row => 
            doubleCurlyMatches.every(placeholder => {
              const key = placeholder.replace(/\{\{|\}\}/g, '');
              return row[key] !== null && row[key] !== undefined;
            })
          ).length,
          type: 'without-null'
        });
      }

      setSqlTabs(tabs);
    } else {
      // Original logic for single curly braces
      doubleCurlyMatches.forEach(placeholder => {
        const key = placeholder.replace(/\{\{|\}\}/g, '');
        
        // Get all unique values for this key from the JSON data
        const values = jsonData
          .map(row => row[key])
          .filter((value, index, arr) => value !== null && value !== undefined && arr.indexOf(value) === index)
          .map(value => typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : String(value))
          .join(',');
        
        processedTemplate = processedTemplate.replace(placeholder, values);
      });

      // Generate SQL scripts for different tabs
      generateSqlTabs(processedTemplate);
    }

    setActiveTab(0);
    setIsLoading(false);
  }, [jsonData, sqlTemplate]);

  // Function to generate SQL tabs with batch regeneration capability
  const generateSqlTabs = useCallback((processedTemplate: string) => {
    // Handle both "INSERT INTO ... VALUES" and standalone "VALUES" statements
    if (processedTemplate.toLowerCase().includes('values')) {
      const valuesMatch = processedTemplate.match(/VALUES\s*\((.*)\)/is);
      if (!valuesMatch || !valuesMatch[1]) {
        setErrors(["Invalid SQL template. Could not find a 'VALUES (...)' clause."]);
        return;
      }
      const rowTemplate = valuesMatch[1];
      
      // For standalone VALUES, use just "VALUES\n", for INSERT INTO preserve the prefix
      const insertStatement = processedTemplate.toLowerCase().includes('insert into') 
        ? processedTemplate.substring(0, valuesMatch.index) + "VALUES\n"
        : "VALUES\n";

      // Generate ALL script
      const allValueRows = jsonData!.map(row => {
        let processedRow = rowTemplate;
        const placeholders = rowTemplate.match(/\{([^}]+)\}/g) || [];

        placeholders.forEach(placeholder => {
          const key = placeholder.replace(/\{|\}/g, '');
          let replacementValue = row[key];

          if (replacementValue === undefined) {
            replacementValue = "NULL";
          } else if (typeof replacementValue === 'string') {
            replacementValue = `'${replacementValue.replace(/'/g, "''")}'`;
          }

          processedRow = processedRow.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(replacementValue));
        });

        return `(${processedRow})`;
      }).join(",\n");

      // Separate rows with and without NULL values
      const rowsWithoutNull: string[] = [];
      const rowsWithNull: string[] = [];

      jsonData!.forEach(row => {
        let processedRow = rowTemplate;
        const placeholders = rowTemplate.match(/\{([^}]+)\}/g) || [];
        let hasNull = false;

        placeholders.forEach(placeholder => {
          const key = placeholder.replace(/\{|\}/g, '');
          let replacementValue = row[key];

          if (replacementValue === undefined || replacementValue === null) {
            hasNull = true;
            replacementValue = "NULL";
          } else if (typeof replacementValue === 'string') {
            replacementValue = `'${replacementValue.replace(/'/g, "''")}'`;
          }

          processedRow = processedRow.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(replacementValue));
        });

        const rowString = `(${processedRow})`;
        if (hasNull) {
          rowsWithNull.push(rowString);
        } else {
          rowsWithoutNull.push(rowString);
        }
      });

      // Create initial tabs
      const tabs: SqlTab[] = [
        {
          id: 'all',
          name: 'ALL',
          script: insertStatement + allValueRows,
          rowCount: jsonData!.length,
          type: 'all'
        }
      ];

      if (rowsWithoutNull.length > 0) {
        tabs.push({
          id: 'without-null',
          name: 'Without NULL values',
          script: insertStatement + rowsWithoutNull.join(",\n"),
          rowCount: rowsWithoutNull.length,
          type: 'without-null'
        });
      }

      if (rowsWithNull.length > 0) {
        tabs.push({
          id: 'with-null',
          name: 'With NULL values',
          script: insertStatement + rowsWithNull.join(",\n"),
          rowCount: rowsWithNull.length,
          type: 'with-null'
        });
      }

      // Add batch tabs if needed
      if (batchSize < jsonData!.length) {
        for (let i = 0; i < jsonData!.length; i += batchSize) {
          const batchData = jsonData!.slice(i, i + batchSize);
          const batchNumber = Math.floor(i / batchSize) + 1;

          const batchValueRows = batchData.map(row => {
            let processedRow = rowTemplate;
            const placeholders = rowTemplate.match(/\{([^}]+)\}/g) || [];

            placeholders.forEach(placeholder => {
              const key = placeholder.replace(/\{|\}/g, '');
              let replacementValue = row[key];

              if (replacementValue === undefined) {
                replacementValue = "NULL";
              } else if (typeof replacementValue === 'string') {
                replacementValue = `'${replacementValue.replace(/'/g, "''")}'`;
              }

              processedRow = processedRow.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(replacementValue));
            });

            return `(${processedRow})`;
          }).join(",\n");

          if (batchValueRows) {
            tabs.push({
              id: `batch-${batchNumber}`,
              name: `Batch ${batchNumber}`,
              script: insertStatement + batchValueRows,
              rowCount: batchData.length,
              type: 'batch'
            });
          }
        }
      }

      setSqlTabs(tabs);
    } else {
      // For non-INSERT statements
      const singleScript = jsonData!.map(row => {
        let processedStatement = processedTemplate;
        const placeholders = processedTemplate.match(/\{([^}]+)\}/g) || [];

        placeholders.forEach(placeholder => {
          const key = placeholder.replace(/\{|\}/g, '');
          let replacementValue = row[key];

          if (replacementValue === undefined) {
            replacementValue = "NULL";
          } else if (typeof replacementValue === 'string') {
            replacementValue = `'${replacementValue.replace(/'/g, "''")}'`;
          }

          processedStatement = processedStatement.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), String(replacementValue));
        });

        return processedStatement;
      }).join("\n");

      setSqlTabs([{
        id: 'all',
        name: 'ALL',
        script: singleScript,
        rowCount: jsonData!.length,
        type: 'all'
      }]);
    }
  }, [jsonData, batchSize]);

  // Removed automatic batch size regeneration to prevent infinite loops
  // Users can manually regenerate by clicking "Generate SQL Script" again

  const copyToClipboard = useCallback(() => {
    const currentTab = sqlTabs[activeTab];
    if (!currentTab) return;
    
    navigator.clipboard.writeText(currentTab.script).then(
      () => {
        setCopySuccess("Copied!");
        setTimeout(() => setCopySuccess(""), 2000);
      },
      () => {
        setCopySuccess("Failed to copy!");
        setTimeout(() => setCopySuccess(""), 2000);
      }
    );
  }, [sqlTabs, activeTab]);

  // Memoize current tab to prevent unnecessary re-renders
  const currentTab = useMemo(() => {
    return sqlTabs[activeTab];
  }, [sqlTabs, activeTab]);

  // Function to handle placeholder click with modifier key support
  const handlePlaceholderClick = useCallback((key: string, event: React.MouseEvent) => {
    const placeholder = `{${key}}`;
    const isModifierHeld = event.ctrlKey || event.metaKey; // Ctrl on Windows/Linux, Cmd on Mac
    
    setSqlTemplate(prev => {
      if (isModifierHeld) {
        // Smart placement logic for adding parameters
        if (!prev) return placeholder;
        
        // Count parentheses
        const openParens = (prev.match(/\(/g) || []).length;
        const closeParens = (prev.match(/\)/g) || []).length;
        
        // Check if there's exactly one complete pair of parentheses
        if (openParens === 1 && closeParens === 1) {
          // Find the position of the closing parenthesis
          const closeParenIndex = prev.indexOf(')');
          const openParenIndex = prev.indexOf('(');
          
          if (openParenIndex !== -1 && closeParenIndex !== -1 && closeParenIndex > openParenIndex) {
            // Get content inside parentheses
            const beforeParen = prev.substring(0, closeParenIndex);
            const afterParen = prev.substring(closeParenIndex);
            const insideContent = prev.substring(openParenIndex + 1, closeParenIndex).trim();
            
            // Add comma if there's already content inside
            const separator = insideContent ? ', ' : '';
            return beforeParen + separator + placeholder + afterParen;
          }
        }
        
        // For multiple () pairs or no () pairs, add at the end
        return prev + ' ' + placeholder;
      } else {
        // Replace current template or set if empty
        return placeholder;
      }
    });
  }, []);

  return (
    <ErrorBoundary>
      <main className="flex min-h-screen flex-col items-center p-12 bg-gray-900 text-white">
        <h1 className="text-5xl font-bold mb-10">Query Generator</h1>
      <div className="w-full max-w-6xl">
        {/* Loading Spinner */}
        {isLoading && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg flex items-center space-x-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span>Processing...</span>
            </div>
          </div>
        )}

        {/* Error Messages */}
        {errors.length > 0 && (
          <div className="mb-6 p-4 bg-red-900 border border-red-700 rounded-lg">
            <h3 className="text-red-300 font-semibold mb-2">Validation Errors:</h3>
            <ul className="list-disc list-inside text-red-200">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Input Mode Tabs */}
        <div className="mb-6">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setInputMode('file')}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                inputMode === 'file'
                  ? "bg-gray-800 text-white border-b-2 border-blue-500"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Upload File
            </button>
            <button
              onClick={() => setInputMode('manual')}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                inputMode === 'manual'
                  ? "bg-gray-800 text-white border-b-2 border-blue-500"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Paste Data
            </button>
          </div>

          {inputMode === 'file' ? (
            /* File Upload */
            <div
              {...getRootProps()}
              className={`p-10 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${
                isDragActive ? "border-blue-500 bg-gray-800" : "border-gray-600 hover:border-gray-500"
              }`}
            >
              <input {...getInputProps()} />
              {isDragActive ? (
                <p className="text-lg">Drop the files here ...</p>
              ) : (
                <div>
                  <p className="text-lg">Drag & drop a JSON or CSV file here, or click to select one</p>
                  <p className="text-sm text-gray-400 mt-2">Supported formats: json, csv</p>
                  {fileName && (
                    <p className="text-sm text-gray-400 mt-2">Current file: {fileName}</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Manual Data Input */
            <div className="space-y-4">
              <div>
                <label htmlFor="manual-data" className="block text-sm font-medium text-gray-400 mb-2">
                  Paste JSON or CSV Data
                </label>
                <textarea
                  id="manual-data"
                  value={manualData}
                  onChange={(e) => setManualData(e.target.value)}
                  className="w-full h-40 p-3 rounded-md bg-gray-800 border border-gray-700 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                  placeholder={`JSON Example:
[
  {"id": 1, "name": "John", "email": "john@example.com"},
  {"id": 2, "name": "Jane", "email": "jane@example.com"}
]

CSV Example:
id,name,email
1,John,john@example.com
2,Jane,jane@example.com`}
                />
              </div>
              <button
                onClick={processManualData}
                disabled={isLoading || !manualData.trim()}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                {isLoading ? "Processing..." : "Process Data"}
              </button>
            </div>
          )}
        </div>

        {jsonData && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-3xl font-semibold">SQL Template</h2>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    History ({templateHistory.length})
                  </button>
                </div>

                {/* Template History Panel */}
                {showHistory && (
                  <div className="mb-4 bg-gray-800 border border-gray-700 rounded-lg">
                    <div className="p-4 border-b border-gray-700">
                      <h3 className="text-lg font-semibold mb-3">Template History</h3>
                      
                      {/* Save Current Template */}
                      <div className="flex gap-2 mb-4">
                        <input
                          type="text"
                          placeholder="Template name..."
                          value={templateName}
                          onChange={(e) => setTemplateName(e.target.value)}
                          className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                          onClick={saveTemplate}
                          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md text-sm font-medium transition-colors"
                        >
                          Save Current
                        </button>
                      </div>
                    </div>

                    {/* Template List */}
                    <div className="max-h-64 overflow-y-auto">
                      {templateHistory.length === 0 ? (
                        <div className="p-4 text-center text-gray-400">
                          No saved templates yet
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-700">
                          {templateHistory
                            .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
                            .map((template) => (
                            <div key={template.id} className="p-4 hover:bg-gray-750 transition-colors">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-medium text-white truncate">{template.name}</h4>
                                  <p className="text-sm text-gray-400 mt-1">
                                    Created: {formatDate(template.createdAt)}
                                  </p>
                                  <p className="text-sm text-gray-400">
                                    Last used: {formatDate(template.lastUsed)}
                                  </p>
                                  <div className="mt-2 text-xs text-gray-500 font-mono bg-gray-900 p-2 rounded border max-h-16 overflow-hidden">
                                    {template.template.substring(0, 120)}
                                    {template.template.length > 120 && "..."}
                                  </div>
                                </div>
                                <div className="ml-4 flex gap-2">
                                  <button
                                    onClick={() => loadTemplate(template)}
                                    className="bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-xs font-medium transition-colors"
                                  >
                                    Load
                                  </button>
                                  <button
                                    onClick={() => deleteTemplate(template.id)}
                                    className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-xs font-medium transition-colors"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <textarea
                  value={sqlTemplate}
                  onChange={(e) => setSqlTemplate(e.target.value)}
                  className="w-full h-48 p-3 rounded-md bg-gray-800 border border-gray-700 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                  placeholder="e.g., INSERT INTO [MyTable] (Col1, Col2) VALUES ({col1}, {col2}); or just VALUES ({col1}, {col2});"
                />
                <div className="mt-4">
                  <h3 className="text-xl font-semibold mb-2">Available Placeholders:</h3>
                  
                  {/* Info about placeholder types */}
                  <div className="mb-3 p-3 bg-blue-900 border border-blue-700 rounded-lg">
                    <div className="text-blue-200 text-sm">
                      <p className="mb-1"><strong>Single {`{key}`}:</strong> Duplicates rows - creates one row per JSON record</p>
                      <p className="mb-1"><strong>Double {`{{key}}`}:</strong> Comma-separated values - combines all values in one line</p>
                      <p className="mb-2 text-xs text-blue-300">Example: WHERE ID IN ({`{{corporateIdentifier}}`}) → WHERE ID IN (42221,42222,4781)</p>
                      <div className="border-t border-blue-700 pt-2 mt-2">
                        <p className="text-xs text-blue-300"><strong>Click:</strong> Replace current placeholders</p>
                        <p className="text-xs text-blue-300"><strong>Ctrl/Cmd + Click:</strong> Smart placement:</p>
                        <p className="text-xs text-blue-300 ml-4">• Single (): Adds inside parentheses</p>
                        <p className="text-xs text-blue-300 ml-4">• Multiple/No (): Adds at the end</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {jsonData && Object.keys(jsonData[0]).map(key => (
                      <span 
                        key={key} 
                        className="bg-gray-700 px-2 py-1 rounded-md text-sm cursor-pointer hover:bg-gray-600 transition-colors select-none" 
                        onClick={(event) => handlePlaceholderClick(key, event)}
                        title={`Click to replace, Ctrl/Cmd+Click for smart placement of {${key}}`}
                      >
                        {`{${key}}`}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <h2 className="text-3xl font-semibold mb-4">JSON Preview ({jsonData.length} records)</h2>
                <div className="max-h-96 overflow-y-auto bg-gray-800 p-4 rounded-md">
                  <pre className="text-sm">
                    <code>{JSON.stringify(jsonData.slice(0, 5), null, 2)}</code>
                    {jsonData.length > 5 && (
                      <p className="text-gray-400 mt-2">... and {jsonData.length - 5} more records</p>
                    )}
                  </pre>
                </div>
              </div>
            </div>

            <button
              onClick={generateSqlScript}
              disabled={isLoading}
              className="w-full mt-8 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md text-white font-semibold text-lg"
            >
              {isLoading ? "Generating..." : "Generate SQL Script"}
            </button>

            {sqlTabs.length > 0 && (
              <div className="mt-8">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-3xl font-semibold">Generated SQL Script</h2>
                  
                  {/* Batch Size Control - Only show if there are batch tabs */}
                  {sqlTabs.some(tab => tab.type === 'batch') && (
                    <div className="flex items-center gap-2">
                      <label htmlFor="batch-size-output" className="text-sm font-medium text-gray-400">
                        Batch Size:
                      </label>
                      <input
                        id="batch-size-output"
                        type="number"
                        value={batchSize}
                        onChange={(e) => {
                          setBatchSize(Number(e.target.value));
                          setBatchSizeChanged(true);
                        }}
                        className="w-20 p-1 rounded-md bg-gray-800 border-gray-700 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        min="1"
                      />
                      {batchSizeChanged && (
                        <button
                          onClick={() => {
                            generateSqlScript();
                            setBatchSizeChanged(false);
                          }}
                          className="bg-orange-600 hover:bg-orange-700 text-white text-xs px-3 py-1 rounded transition-colors"
                        >
                          Regenerate
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                {/* SQL Tabs */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {sqlTabs.map((tab, index) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(index)}
                      className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                        activeTab === index
                          ? "bg-gray-800 text-white border-b-2 border-blue-500"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      } ${
                        tab.type === 'all' ? 'border border-green-500' :
                        tab.type === 'without-null' ? 'border border-blue-500' :
                        tab.type === 'with-null' ? 'border border-yellow-500' :
                        'border border-purple-500'
                      }`}
                    >
                      {tab.name} ({tab.rowCount} rows)
                    </button>
                  ))}
                </div>

                {/* SQL Output with Syntax Highlighting */}
                <div className="bg-gray-800 rounded-md overflow-hidden max-h-96">
                  <div className="flex justify-between items-center px-4 py-2 bg-gray-700">
                    <span className="text-gray-300 font-mono text-sm">
                      SQL Output - {sqlTabs[activeTab]?.name} ({sqlTabs[activeTab]?.rowCount} rows)
                    </span>
                    <button
                      onClick={copyToClipboard}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-sm transition-colors"
                    >
                      {copySuccess || "Copy"}
                    </button>
                  </div>
                  <div className="overflow-auto max-h-80">
                    <MemoizedSqlHighlighter script={currentTab?.script || ""} />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
    </ErrorBoundary>
  );
}
