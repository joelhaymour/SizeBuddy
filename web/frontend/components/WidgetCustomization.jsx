import {
  LegacyCard,
  Button,
  Text,
  Box,
  LegacyStack,
  Banner,
  Frame,
  Loading,
  Toast,
  SkeletonBodyText,
  Layout,
  Tabs,
  TextField,
  Select,
  ColorPicker,
  RangeSlider,
  ChoiceList
} from "@shopify/polaris";
import { useState, useCallback, useEffect, useRef } from "react";
import { useAuthenticatedFetch } from '@shopify/app-bridge-react';

export function WidgetCustomization({ shop, host }) {
  const fetch = useAuthenticatedFetch();
  const [isLoading, setIsLoading] = useState(true);
  const [toastProps, setToastProps] = useState({ content: '', error: false });
  const [showToast, setShowToast] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTab, setSelectedTab] = useState(0);
  const isMounted = useRef(true);
  
  // Widget settings state
  const [settings, setSettings] = useState({
    appearance: {
      primaryColor: {
        hue: 0,
        brightness: 0,
        saturation: 0,
        alpha: 1,
        rgb: { r: 0, g: 0, b: 0, a: 1 }
      },
      secondaryColor: {
        hue: 0,
        brightness: 1,
        saturation: 0,
        alpha: 1,
        rgb: { r: 255, g: 255, b: 255, a: 1 }
      },
      buttonStyle: "rounded",
      fontFamily: "system-ui",
      fontSize: "16px"
    },
    behavior: {
      position: "bottom-right",
      showOnLoad: true,
      displayDelay: 0,
      animationStyle: "slide",
      persistUserData: true
    },
    content: {
      buttonText: "Find My Size",
      headerText: "Size Recommendation",
      descriptionText: "Get your perfect fit with our size calculator",
      successMessage: "We recommend size {size} for you"
    }
  });

  const tabs = [
    {
      id: 'appearance',
      content: 'Appearance',
      accessibilityLabel: 'Widget appearance settings',
      panelID: 'appearance-settings-content',
    },
    {
      id: 'behavior',
      content: 'Behavior',
      accessibilityLabel: 'Widget behavior settings',
      panelID: 'behavior-settings-content',
    },
    {
      id: 'content',
      content: 'Content',
      accessibilityLabel: 'Widget content settings',
      panelID: 'content-settings-content',
    },
  ];

  const buttonStyleOptions = [
    { label: 'Rounded', value: 'rounded' },
    { label: 'Square', value: 'square' },
    { label: 'Pill', value: 'pill' }
  ];

  const fontFamilyOptions = [
    { label: 'System UI', value: 'system-ui' },
    { label: 'Arial', value: 'Arial' },
    { label: 'Helvetica', value: 'Helvetica' },
    { label: 'Roboto', value: 'Roboto' }
  ];

  const positionOptions = [
    { label: 'Bottom Right', value: 'bottom-right' },
    { label: 'Bottom Left', value: 'bottom-left' },
    { label: 'Top Right', value: 'top-right' },
    { label: 'Top Left', value: 'top-left' }
  ];

  const animationOptions = [
    { label: 'Slide', value: 'slide' },
    { label: 'Fade', value: 'fade' },
    { label: 'Pop', value: 'pop' }
  ];

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!shop || !host) {
      console.error('Missing required parameters:', { shop, host });
      setError('Missing required parameters');
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/widget-customization?shop=${shop}&host=${host}`);
      
      if (!isMounted.current) return;

      if (!response.ok) {
        throw new Error('Failed to fetch widget settings');
      }
      
      const data = await response.json();
      if (isMounted.current) {
        setSettings(data);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error fetching widget settings:', error);
      if (isMounted.current) {
        setError(error.message);
        setIsLoading(false);
      }
    }
  }, [fetch, shop, host]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = useCallback(async () => {
    try {
      const response = await fetch(`/api/widget-customization?shop=${shop}&host=${host}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings }),
      });

      if (!response.ok) {
        throw new Error('Failed to update widget settings');
      }

      setToastProps({
        content: 'Widget settings updated successfully',
        error: false
      });
      setShowToast(true);
    } catch (error) {
      console.error('Error saving widget settings:', error);
      setToastProps({
        content: error.message,
        error: true
      });
      setShowToast(true);
    }
  }, [fetch, shop, host, settings]);

  const handleSettingChange = useCallback((section, key, value) => {
    setSettings(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value
      }
    }));
  }, []);

  const handlePrimaryColorChange = (color) => {
    const rgbaColor = {
      r: Math.round(color.brightness * 255),
      g: Math.round(color.saturation * 255),
      b: Math.round(color.hue * 255),
      a: color.alpha || 1
    };
    
    setSettings(prev => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        primaryColor: {
          ...color,
          rgb: rgbaColor
        }
      }
    }));
  };

  const handleSecondaryColorChange = (color) => {
    const rgbaColor = {
      r: Math.round(color.brightness * 255),
      g: Math.round(color.saturation * 255),
      b: Math.round(color.hue * 255),
      a: color.alpha || 1
    };
    
    setSettings(prev => ({
      ...prev,
      appearance: {
        ...prev.appearance,
        secondaryColor: {
          ...color,
          rgb: rgbaColor
        }
      }
    }));
  };

  const toastMarkup = showToast && (
    <Toast
      content={toastProps.content}
      error={toastProps.error}
      onDismiss={() => setShowToast(false)}
    />
  );

  if (isLoading) {
    return (
      <Frame>
        <LegacyCard>
          <Box padding="4">
            <Box paddingBlockEnd="4">
              <LegacyStack distribution="equalSpacing" alignment="center">
                <Text variant="headingMd" as="h3">Widget Customization</Text>
                <div style={{ width: '87px', height: '36px', background: '#f1f2f3', borderRadius: '4px' }} />
              </LegacyStack>
            </Box>
            <LegacyCard sectioned>
              <SkeletonBodyText lines={3} />
            </LegacyCard>
          </Box>
        </LegacyCard>
      </Frame>
    );
  }

  if (error) {
    return (
      <Frame>
        <LegacyCard>
          <Box padding="4">
            <Banner status="critical">
              <p>{error}</p>
            </Banner>
          </Box>
        </LegacyCard>
      </Frame>
    );
  }

  const appearanceContent = (
    <LegacyCard.Section>
      <LegacyStack vertical spacing="4">
        <Box paddingBlockEnd="4">
          <Text variant="headingMd" as="h3">Colors</Text>
          <Box paddingBlockStart="4">
            <LegacyStack vertical spacing="4">
              <ColorPicker
                label="Primary Color"
                color={settings.appearance.primaryColor}
                onChange={handlePrimaryColorChange}
                allowAlpha
              />
              <ColorPicker
                label="Secondary Color"
                color={settings.appearance.secondaryColor}
                onChange={handleSecondaryColorChange}
                allowAlpha
              />
            </LegacyStack>
          </Box>
        </Box>

        <Box paddingBlockEnd="4">
          <Text variant="headingMd" as="h3">Typography</Text>
          <Box paddingBlockStart="4">
            <LegacyStack vertical spacing="4">
              <Select
                label="Font Family"
                options={fontFamilyOptions}
                value={settings.appearance.fontFamily}
                onChange={(value) => handleSettingChange('appearance', 'fontFamily', value)}
              />
              <TextField
                label="Font Size"
                value={settings.appearance.fontSize}
                onChange={(value) => handleSettingChange('appearance', 'fontSize', value)}
                helpText="Enter a valid CSS font size (e.g., 16px, 1rem)"
              />
            </LegacyStack>
          </Box>
        </Box>

        <Box paddingBlockEnd="4">
          <Text variant="headingMd" as="h3">Button Style</Text>
          <Box paddingBlockStart="4">
            <Select
              label="Button Shape"
              options={buttonStyleOptions}
              value={settings.appearance.buttonStyle}
              onChange={(value) => handleSettingChange('appearance', 'buttonStyle', value)}
            />
          </Box>
        </Box>
      </LegacyStack>
    </LegacyCard.Section>
  );

  const behaviorContent = (
    <LegacyCard.Section>
      <LegacyStack vertical spacing="4">
        <Select
          label="Widget Position"
          options={positionOptions}
          value={settings.behavior.position}
          onChange={(value) => handleSettingChange('behavior', 'position', value)}
        />

        <ChoiceList
          title="Display Options"
          choices={[
            {
              label: 'Show widget on page load',
              value: 'showOnLoad'
            },
            {
              label: 'Remember user data',
              value: 'persistUserData'
            }
          ]}
          selected={[
            ...(settings.behavior.showOnLoad ? ['showOnLoad'] : []),
            ...(settings.behavior.persistUserData ? ['persistUserData'] : [])
          ]}
          onChange={(values) => {
            handleSettingChange('behavior', 'showOnLoad', values.includes('showOnLoad'));
            handleSettingChange('behavior', 'persistUserData', values.includes('persistUserData'));
          }}
        />

        <RangeSlider
          label="Display Delay"
          value={settings.behavior.displayDelay}
          min={0}
          max={10}
          step={0.5}
          onChange={(value) => handleSettingChange('behavior', 'displayDelay', value)}
          output
          helpText="Delay in seconds before showing the widget"
        />

        <Select
          label="Animation Style"
          options={animationOptions}
          value={settings.behavior.animationStyle}
          onChange={(value) => handleSettingChange('behavior', 'animationStyle', value)}
        />
      </LegacyStack>
    </LegacyCard.Section>
  );

  const contentContent = (
    <LegacyCard.Section>
      <LegacyStack vertical spacing="4">
        <TextField
          label="Button Text"
          value={settings.content.buttonText}
          onChange={(value) => handleSettingChange('content', 'buttonText', value)}
          helpText="Text displayed on the size calculator button"
        />

        <TextField
          label="Header Text"
          value={settings.content.headerText}
          onChange={(value) => handleSettingChange('content', 'headerText', value)}
          helpText="Main heading in the size calculator widget"
        />

        <TextField
          label="Description Text"
          value={settings.content.descriptionText}
          onChange={(value) => handleSettingChange('content', 'descriptionText', value)}
          multiline={3}
          helpText="Explanatory text shown in the widget"
        />

        <TextField
          label="Success Message"
          value={settings.content.successMessage}
          onChange={(value) => handleSettingChange('content', 'successMessage', value)}
          helpText="Message shown after size calculation. Use {size} to show the recommended size"
        />
      </LegacyStack>
    </LegacyCard.Section>
  );

  return (
    <>
      {toastMarkup}
      <Layout>
        <Layout.Section>
          <LegacyCard>
            <Box padding="4">
              <Box paddingBlockEnd="4">
                <LegacyStack distribution="equalSpacing" alignment="center">
                  <Text variant="headingMd" as="h3">Widget Customization</Text>
                  <Button 
                    primary 
                    onClick={handleSave}
                    disabled={!shop || !host}
                  >
                    Save Changes
                  </Button>
                </LegacyStack>
              </Box>

              <Tabs
                tabs={tabs}
                selected={selectedTab}
                onSelect={setSelectedTab}
                fitted
              />
              
              <Box paddingBlockStart="4">
                {selectedTab === 0 && appearanceContent}
                {selectedTab === 1 && behaviorContent}
                {selectedTab === 2 && contentContent}
              </Box>
            </Box>
          </LegacyCard>
        </Layout.Section>
        
        <Layout.Section secondary>
          <LegacyCard>
            <LegacyCard.Section>
              <Text variant="headingMd" as="h3">
                About Widget Customization
              </Text>
              <Box paddingBlockStart="3">
                <Text as="p" variant="bodyMd">
                  Customize how your size calculator widget looks and behaves on your store. Changes are automatically previewed in the widget below.
                </Text>
              </Box>
            </LegacyCard.Section>
            <LegacyCard.Section>
              <Text variant="headingMd" as="h3">
                Preview
              </Text>
              <Box paddingBlockStart="3">
                <div 
                  style={{
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '20px',
                    backgroundColor: `rgba(${settings.appearance.secondaryColor?.rgb?.r || 255}, ${settings.appearance.secondaryColor?.rgb?.g || 255}, ${settings.appearance.secondaryColor?.rgb?.b || 255}, ${settings.appearance.secondaryColor?.rgb?.a || 1})`,
                    fontFamily: settings.appearance.fontFamily,
                    fontSize: settings.appearance.fontSize
                  }}
                >
                  <Text as="p" variant="bodyMd" fontWeight="bold">
                    {settings.content.headerText}
                  </Text>
                  <Box paddingBlockStart="3">
                    <Text as="p" variant="bodyMd">
                      {settings.content.descriptionText}
                    </Text>
                  </Box>
                  <Box paddingBlockStart="4">
                    <Button
                      style={{
                        backgroundColor: `rgba(${settings.appearance.primaryColor?.rgb?.r || 0}, ${settings.appearance.primaryColor?.rgb?.g || 0}, ${settings.appearance.primaryColor?.rgb?.b || 0}, ${settings.appearance.primaryColor?.rgb?.a || 1})`,
                        color: '#ffffff',
                        borderRadius: 
                          settings.appearance.buttonStyle === 'rounded' ? '16px' :
                          settings.appearance.buttonStyle === 'pill' ? '999px' : '0px'
                      }}
                    >
                      {settings.content.buttonText}
                    </Button>
                  </Box>
                </div>
              </Box>
            </LegacyCard.Section>
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </>
  );
} 